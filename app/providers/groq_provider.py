"""Groq provider for ultra-fast open-source model inference + Edge-TTS.

Uses Groq's OpenAI-compatible API to run open-source models (Llama 3.3 70B,
DeepSeek, Mixtral) with industry-leading inference speed. TTS is handled by
Microsoft Edge-TTS for free, high-quality speech synthesis.

Architecture:
    Browser STT (Web Speech API) → Groq API (Llama 3.3) → Edge-TTS → Audio playback
"""

from __future__ import annotations

import asyncio
import base64
import json
import uuid
from typing import Any, AsyncIterator

import edge_tts
from groq import AsyncGroq

from app.core.config import settings
from app.core.logging import logger
from app.models.schemas import ConversationState, MessageRole, SessionConfig
from app.providers.base import VoiceProviderBase
from app.tools.registry import registry


class GroqProvider(VoiceProviderBase):
    """Pipeline-based voice provider using Groq (open-source LLMs) + Edge-TTS.

    Groq provides the fastest inference for open-source models like Llama 3.3 70B,
    making it ideal for real-time conversational AI. Combined with Edge-TTS for
    speech synthesis, this provider offers a fully free, open-source-powered
    voice agent pipeline.
    """

    def __init__(self) -> None:
        self._session_id: str = ""
        self._conversation: ConversationState | None = None
        self._client: AsyncGroq | None = None
        self._event_queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
        self._connected = False
        self._tts_voice: str = settings.groq_tts_voice
        self._messages: list[dict[str, Any]] = []

    async def connect(self, config: SessionConfig) -> None:
        self._session_id = str(uuid.uuid4())
        self._conversation = ConversationState(session_id=self._session_id)

        self._client = AsyncGroq(api_key=settings.groq_api_key)

        system_prompt = config.system_prompt or settings.agent_persona
        if config.tools_enabled:
            system_prompt += (
                "\n\nYou have access to tools. When you need to use a tool, "
                "call it using the function calling interface. After receiving "
                "tool results, incorporate them naturally into your response."
            )

        self._messages = [{"role": "system", "content": system_prompt}]

        if config.voice:
            self._tts_voice = config.voice

        self._connected = True
        logger.info(
            f"Groq session started: {self._session_id} "
            f"(model={settings.groq_model}, voice={self._tts_voice})"
        )

        await self._event_queue.put({
            "type": "session.created",
            "data": {"session_id": self._session_id},
        })

    async def disconnect(self) -> None:
        self._connected = False
        if self._client:
            await self._client.close()
            self._client = None
        logger.info(f"Groq session ended: {self._session_id}")

    async def send_audio(self, audio_data: bytes) -> None:
        pass

    async def send_text(self, text: str) -> None:
        """Process a text message through the Groq LLM pipeline and generate audio response."""
        if not self._client or not self._connected:
            return

        logger.info(f"User: {text}")
        self._messages.append({"role": "user", "content": text})

        if self._conversation:
            self._conversation.add_message(MessageRole.USER, text)

        await self._event_queue.put({
            "type": "transcript.done",
            "data": {"text": text, "role": "user"},
        })

        try:
            response_text = await self._get_llm_response()
            logger.info(f"Assistant: {response_text[:100]}")

            self._messages.append({"role": "assistant", "content": response_text})
            if self._conversation:
                self._conversation.add_message(MessageRole.ASSISTANT, response_text)

            await self._event_queue.put({
                "type": "transcript.done",
                "data": {"text": response_text, "role": "assistant"},
            })

            await self._synthesize_and_stream(response_text)

            await self._event_queue.put({"type": "response.done", "data": {"status": "completed"}})

        except Exception as e:
            logger.error(f"Groq pipeline error: {e}")
            await self._event_queue.put({
                "type": "error",
                "data": {"message": str(e)},
            })

    async def _get_llm_response(self) -> str:
        """Call Groq API for a chat completion with Llama, handling tool calls."""
        tools = registry.get_openai_schemas() if registry.list_tools() else None

        response = await self._client.chat.completions.create(
            model=settings.groq_model,
            messages=self._messages,
            tools=tools,
            temperature=0.7,
            max_tokens=1024,
        )

        choice = response.choices[0]

        if choice.message.tool_calls:
            self._messages.append(choice.message.model_dump())

            for tool_call in choice.message.tool_calls:
                fn = tool_call.function
                logger.info(f"Tool call: {fn.name}({fn.arguments})")

                await self._event_queue.put({
                    "type": "tool.calling",
                    "data": {"name": fn.name, "arguments": fn.arguments},
                })

                try:
                    args = json.loads(fn.arguments)
                    result = await registry.execute(fn.name, args)
                except Exception as e:
                    result = json.dumps({"error": str(e)})

                await self._event_queue.put({
                    "type": "tool.result",
                    "data": {"name": fn.name, "result": result},
                })

                self._messages.append({
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "content": result,
                })

            follow_up = await self._client.chat.completions.create(
                model=settings.groq_model,
                messages=self._messages,
                temperature=0.7,
                max_tokens=1024,
            )
            return follow_up.choices[0].message.content or ""

        return choice.message.content or ""

    async def _synthesize_and_stream(self, text: str) -> None:
        """Convert text to speech using Edge-TTS and stream audio chunks."""
        communicate = edge_tts.Communicate(text, self._tts_voice)

        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_b64 = base64.b64encode(chunk["data"]).decode("utf-8")
                await self._event_queue.put({
                    "type": "audio.delta",
                    "data": {"audio": audio_b64, "format": "mp3"},
                })

        await self._event_queue.put({"type": "audio.done", "data": {}})

    async def receive_events(self) -> AsyncIterator[dict[str, Any]]:
        while self._connected:
            try:
                event = await asyncio.wait_for(self._event_queue.get(), timeout=1.0)
                yield event
                if event.get("type") == "session.ended":
                    break
            except asyncio.TimeoutError:
                continue

    async def send_tool_result(self, call_id: str, result: str) -> None:
        pass

    async def interrupt(self) -> None:
        while not self._event_queue.empty():
            try:
                self._event_queue.get_nowait()
            except asyncio.QueueEmpty:
                break

    def get_conversation_state(self) -> ConversationState | None:
        return self._conversation

"""Groq provider for ultra-fast open-source model inference + Edge-TTS.

Uses Groq's OpenAI-compatible API to run open-source models (Llama 3.3 70B,
DeepSeek, Mixtral) with industry-leading inference speed. TTS is handled by
Microsoft Edge-TTS for free, high-quality speech synthesis.

Architecture:
    Browser STT (Web Speech API) → Groq API (Llama 3.3) → Edge-TTS → Audio playback

Key feature: Streaming LLM responses are sentence-chunked and TTS'd immediately,
so audio playback begins within ~500ms of the first complete sentence — creating
a natural, conversational feel similar to true speech-to-speech models.
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

_SENTENCE_ENDERS = frozenset(".!?")
_MIN_CHUNK_LENGTH = 40


class GroqProvider(VoiceProviderBase):
    """Pipeline-based voice provider using Groq (open-source LLMs) + Edge-TTS.

    Groq provides the fastest inference for open-source models like Llama 3.3 70B,
    making it ideal for real-time conversational AI. Combined with Edge-TTS for
    speech synthesis, this provider offers a fully free, open-source-powered
    voice agent pipeline.

    The streaming architecture TTS-es each sentence as it arrives from the LLM,
    rather than waiting for the full response — dramatically reducing latency.
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
        """Process text through streaming LLM and sentence-chunked TTS."""
        if not self._client or not self._connected:
            return

        self._messages.append({"role": "user", "content": text})
        if self._conversation:
            self._conversation.add_message(MessageRole.USER, text)

        await self._event_queue.put({
            "type": "transcript.done",
            "data": {"text": text, "role": "user"},
        })

        await self._event_queue.put({"type": "response.thinking", "data": {}})

        try:
            response_text = await self._stream_response()

            self._messages.append({"role": "assistant", "content": response_text})
            if self._conversation:
                self._conversation.add_message(MessageRole.ASSISTANT, response_text)

            await self._event_queue.put({
                "type": "transcript.done",
                "data": {"text": response_text, "role": "assistant"},
            })
            await self._event_queue.put({"type": "response.done", "data": {"status": "completed"}})

        except Exception as e:
            logger.error(f"Groq pipeline error: {e}")
            await self._event_queue.put({
                "type": "error",
                "data": {"message": str(e)},
            })

    async def _stream_response(self) -> str:
        """Stream LLM response and TTS each sentence as it arrives."""
        tools = registry.get_openai_schemas() if registry.list_tools() else None

        stream = await self._client.chat.completions.create(
            model=settings.groq_model,
            messages=self._messages,
            tools=tools,
            temperature=0.7,
            max_tokens=1024,
            stream=True,
        )

        full_text = ""
        sentence_buffer = ""
        tool_calls: dict[int, dict[str, str]] = {}
        has_tool_calls = False

        async for chunk in stream:
            if not chunk.choices:
                continue

            delta = chunk.choices[0].delta

            if delta.tool_calls:
                has_tool_calls = True
                for tc in delta.tool_calls:
                    idx = tc.index
                    if idx not in tool_calls:
                        tool_calls[idx] = {"id": "", "name": "", "arguments": ""}
                    if tc.id:
                        tool_calls[idx]["id"] = tc.id
                    if tc.function:
                        if tc.function.name:
                            tool_calls[idx]["name"] = tc.function.name
                        if tc.function.arguments:
                            tool_calls[idx]["arguments"] += tc.function.arguments

            if delta.content:
                full_text += delta.content
                sentence_buffer += delta.content

                await self._event_queue.put({
                    "type": "transcript.delta",
                    "data": {"text": delta.content, "role": "assistant"},
                })

                if self._at_sentence_boundary(sentence_buffer):
                    await self._synthesize_speech(sentence_buffer.strip())
                    sentence_buffer = ""

        if sentence_buffer.strip():
            await self._synthesize_speech(sentence_buffer.strip())

        if has_tool_calls:
            return await self._handle_tool_calls(tool_calls)

        await self._event_queue.put({"type": "audio.done", "data": {}})
        return full_text

    def _at_sentence_boundary(self, text: str) -> bool:
        """Check if buffer ends at a natural speech pause point."""
        stripped = text.rstrip()
        if len(stripped) < _MIN_CHUNK_LENGTH:
            return False
        return stripped[-1] in _SENTENCE_ENDERS or "\n\n" in text

    async def _synthesize_speech(self, text: str) -> None:
        """Convert text to speech using Edge-TTS and stream audio chunks."""
        communicate = edge_tts.Communicate(text, self._tts_voice)
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_b64 = base64.b64encode(chunk["data"]).decode("utf-8")
                await self._event_queue.put({
                    "type": "audio.delta",
                    "data": {"audio": audio_b64, "format": "mp3"},
                })

    async def _handle_tool_calls(self, tool_calls: dict[int, dict[str, str]]) -> str:
        """Process accumulated tool calls from streaming and get follow-up response."""
        tool_calls_list = []
        for idx in sorted(tool_calls.keys()):
            tc = tool_calls[idx]
            tool_calls_list.append({
                "id": tc["id"],
                "type": "function",
                "function": {"name": tc["name"], "arguments": tc["arguments"]},
            })

        self._messages.append({
            "role": "assistant",
            "tool_calls": tool_calls_list,
            "content": None,
        })

        for tc_data in tool_calls_list:
            fn_name = tc_data["function"]["name"]
            fn_args = tc_data["function"]["arguments"]

            logger.info(f"Tool call: {fn_name}({fn_args})")
            await self._event_queue.put({
                "type": "tool.calling",
                "data": {"name": fn_name, "arguments": fn_args},
            })

            try:
                args = json.loads(fn_args)
                result = await registry.execute(fn_name, args)
            except Exception as e:
                result = json.dumps({"error": str(e)})

            await self._event_queue.put({
                "type": "tool.result",
                "data": {"name": fn_name, "result": result},
            })

            self._messages.append({
                "role": "tool",
                "tool_call_id": tc_data["id"],
                "content": result,
            })

        follow_up = await self._client.chat.completions.create(
            model=settings.groq_model,
            messages=self._messages,
            temperature=0.7,
            max_tokens=1024,
        )

        response_text = follow_up.choices[0].message.content or ""

        if response_text:
            await self._event_queue.put({
                "type": "transcript.done",
                "data": {"text": response_text, "role": "assistant"},
            })
            await self._synthesize_speech(response_text)
            await self._event_queue.put({"type": "audio.done", "data": {}})

        return response_text

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

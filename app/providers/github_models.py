from __future__ import annotations

import asyncio
import base64
import io
import json
import uuid
from typing import Any, AsyncIterator

import edge_tts
from openai import AsyncOpenAI

from app.core.config import settings
from app.core.logging import logger
from app.models.schemas import ConversationState, MessageRole, SessionConfig
from app.providers.base import VoiceProviderBase
from app.tools.registry import registry


class GitHubModelsProvider(VoiceProviderBase):
    """Pipeline-based voice provider using GitHub Models (free GPT-4o) + Edge-TTS.

    Architecture:
        Browser STT (Web Speech API) → GitHub Models LLM → Edge-TTS → Audio playback

    This provider uses a text-based pipeline instead of a WebSocket stream:
    - STT is handled client-side via the browser's Web Speech API (free)
    - LLM calls go to GitHub Models API (free GPT-4o with a GitHub token)
    - TTS uses Microsoft Edge-TTS (free, high-quality, ~30 voices)
    """

    def __init__(self) -> None:
        self._session_id: str = ""
        self._conversation: ConversationState | None = None
        self._client: AsyncOpenAI | None = None
        self._event_queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
        self._connected = False
        self._tts_voice: str = settings.github_tts_voice
        self._messages: list[dict[str, str]] = []

    async def connect(self, config: SessionConfig) -> None:
        self._session_id = str(uuid.uuid4())
        self._conversation = ConversationState(session_id=self._session_id)

        self._client = AsyncOpenAI(
            base_url=settings.github_models_endpoint,
            api_key=settings.github_token,
        )

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
            f"GitHub Models session started: {self._session_id} "
            f"(model={settings.github_model}, voice={self._tts_voice})"
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
        logger.info(f"GitHub Models session ended: {self._session_id}")

    async def send_audio(self, audio_data: bytes) -> None:
        # Audio is not used in pipeline mode - STT happens client-side
        pass

    async def send_text(self, text: str) -> None:
        """Process a text message through the LLM pipeline and generate audio response."""
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

            # Send transcript
            await self._event_queue.put({
                "type": "transcript.done",
                "data": {"text": response_text, "role": "assistant"},
            })

            # Generate and stream TTS audio
            await self._synthesize_and_stream(response_text)

            await self._event_queue.put({"type": "response.done", "data": {"status": "completed"}})

        except Exception as e:
            logger.error(f"Pipeline error: {e}")
            await self._event_queue.put({
                "type": "error",
                "data": {"message": str(e)},
            })

    async def _get_llm_response(self) -> str:
        """Call GitHub Models API for a chat completion, handling tool calls."""
        tools = registry.get_openai_schemas() if registry.list_tools() else None

        response = await self._client.chat.completions.create(
            model=settings.github_model,
            messages=self._messages,
            tools=tools,
            temperature=0.7,
            max_tokens=1024,
        )

        choice = response.choices[0]

        # Handle tool calls
        if choice.message.tool_calls:
            # Add the assistant message with tool calls
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

            # Get follow-up response after tool results
            follow_up = await self._client.chat.completions.create(
                model=settings.github_model,
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
        # Tool results are handled inline in _get_llm_response
        pass

    async def interrupt(self) -> None:
        # Clear the event queue to stop current response
        while not self._event_queue.empty():
            try:
                self._event_queue.get_nowait()
            except asyncio.QueueEmpty:
                break

    def get_conversation_state(self) -> ConversationState | None:
        return self._conversation

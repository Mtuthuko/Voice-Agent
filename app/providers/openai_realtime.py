"""OpenAI Realtime API provider for native voice-to-voice streaming.

Uses a persistent WebSocket connection to OpenAI's Realtime API endpoint.
Audio flows bidirectionally as base64-encoded PCM16 at 24 kHz.
Supports server-side VAD, function calling, and audio transcription.
"""

from __future__ import annotations

import base64
import json
import uuid
from typing import Any, AsyncIterator

import websockets
from websockets.asyncio.client import ClientConnection

from app.core.config import settings
from app.core.logging import logger
from app.models.schemas import ConversationState, MessageRole, SessionConfig
from app.providers.base import VoiceProviderBase
from app.tools.registry import registry

OPENAI_REALTIME_URL = "wss://api.openai.com/v1/realtime"


class OpenAIRealtimeProvider(VoiceProviderBase):
    """Provider for OpenAI's Realtime API with native voice-to-voice capabilities.

    Lifecycle: connect() -> send_audio()/send_text() <-> receive_events() -> disconnect()
    """

    def __init__(self) -> None:
        self._ws: ClientConnection | None = None
        self._session_id: str = ""
        self._conversation: ConversationState | None = None

    async def connect(self, config: SessionConfig) -> None:
        self._session_id = str(uuid.uuid4())
        self._conversation = ConversationState(session_id=self._session_id)

        model = settings.openai_realtime_model
        url = f"{OPENAI_REALTIME_URL}?model={model}"

        logger.info(f"Connecting to OpenAI Realtime API ({model})...")
        self._ws = await websockets.connect(
            url,
            additional_headers={
                "Authorization": f"Bearer {settings.openai_api_key}",
                "OpenAI-Beta": "realtime=v1",
            },
        )

        # Configure the session
        await self._send_event({
            "type": "session.update",
            "session": {
                "modalities": ["text", "audio"],
                "instructions": config.system_prompt or settings.agent_persona,
                "voice": config.voice or settings.openai_voice,
                "input_audio_format": "pcm16",
                "output_audio_format": "pcm16",
                "input_audio_transcription": {
                    "model": "whisper-1",
                },
                "turn_detection": {
                    "type": "server_vad",
                    "threshold": settings.turn_detection_threshold,
                    "prefix_padding_ms": 300,
                    "silence_duration_ms": 500,
                } if config.turn_detection else None,
                "tools": registry.get_openai_schemas() if config.tools_enabled else [],
                "tool_choice": "auto",
                "temperature": 0.7,
            },
        })
        logger.info(f"Session configured: {self._session_id}")

    async def disconnect(self) -> None:
        if self._ws:
            await self._ws.close()
            self._ws = None
            logger.info(f"Disconnected session: {self._session_id}")

    async def send_audio(self, audio_data: bytes) -> None:
        if not self._ws:
            raise ConnectionError("Not connected to OpenAI Realtime API")

        audio_b64 = base64.b64encode(audio_data).decode("utf-8")
        await self._send_event({
            "type": "input_audio_buffer.append",
            "audio": audio_b64,
        })

    async def commit_audio(self) -> None:
        """Commit the audio buffer (used in manual turn detection mode)."""
        await self._send_event({"type": "input_audio_buffer.commit"})
        await self._send_event({"type": "response.create"})

    async def send_text(self, text: str) -> None:
        """Send a text message to the conversation."""
        if not self._ws:
            raise ConnectionError("Not connected to OpenAI Realtime API")

        await self._send_event({
            "type": "conversation.item.create",
            "item": {
                "type": "message",
                "role": "user",
                "content": [{"type": "input_text", "text": text}],
            },
        })
        await self._send_event({"type": "response.create"})

        if self._conversation:
            self._conversation.add_message(MessageRole.USER, text)

    async def receive_events(self) -> AsyncIterator[dict[str, Any]]:
        if not self._ws:
            raise ConnectionError("Not connected to OpenAI Realtime API")

        try:
            async for message in self._ws:
                event = json.loads(message)
                event_type = event.get("type", "")

                parsed = self._parse_event(event_type, event)
                if parsed:
                    yield parsed

        except websockets.exceptions.ConnectionClosed:
            logger.info("WebSocket connection closed")
            yield {"type": "session.ended", "data": {"reason": "connection_closed"}}

    async def send_tool_result(self, call_id: str, result: str) -> None:
        await self._send_event({
            "type": "conversation.item.create",
            "item": {
                "type": "function_call_output",
                "call_id": call_id,
                "output": result,
            },
        })
        await self._send_event({"type": "response.create"})

    async def interrupt(self) -> None:
        await self._send_event({"type": "response.cancel"})
        await self._send_event({"type": "input_audio_buffer.clear"})

    def get_conversation_state(self) -> ConversationState | None:
        return self._conversation

    async def _send_event(self, event: dict[str, Any]) -> None:
        if self._ws:
            await self._ws.send(json.dumps(event))

    def _parse_event(self, event_type: str, event: dict[str, Any]) -> dict[str, Any] | None:
        """Parse OpenAI Realtime events into normalized format."""
        if event_type == "session.created":
            return {
                "type": "session.created",
                "data": {"session_id": event.get("session", {}).get("id", "")},
            }

        if event_type == "response.audio.delta":
            return {
                "type": "audio.delta",
                "data": {"audio": event.get("delta", "")},
            }

        if event_type == "response.audio.done":
            return {"type": "audio.done", "data": {}}

        if event_type == "response.audio_transcript.delta":
            return {
                "type": "transcript.delta",
                "data": {
                    "text": event.get("delta", ""),
                    "role": "assistant",
                },
            }

        if event_type == "response.audio_transcript.done":
            transcript = event.get("transcript", "")
            if self._conversation and transcript:
                self._conversation.add_message(MessageRole.ASSISTANT, transcript)
            return {
                "type": "transcript.done",
                "data": {"text": transcript, "role": "assistant"},
            }

        if event_type == "conversation.item.input_audio_transcription.completed":
            transcript = event.get("transcript", "")
            if self._conversation and transcript:
                self._conversation.add_message(MessageRole.USER, transcript)
            return {
                "type": "transcript.done",
                "data": {"text": transcript, "role": "user"},
            }

        if event_type == "response.function_call_arguments.done":
            return {
                "type": "tool.call",
                "data": {
                    "call_id": event.get("call_id", ""),
                    "name": event.get("name", ""),
                    "arguments": event.get("arguments", "{}"),
                },
            }

        if event_type == "input_audio_buffer.speech_started":
            return {"type": "speech.started", "data": {}}

        if event_type == "input_audio_buffer.speech_stopped":
            return {"type": "speech.stopped", "data": {}}

        if event_type == "response.done":
            return {
                "type": "response.done",
                "data": {
                    "status": event.get("response", {}).get("status", ""),
                },
            }

        if event_type == "error":
            error = event.get("error", {})
            logger.error(f"OpenAI error: {error}")
            return {
                "type": "error",
                "data": {
                    "message": error.get("message", "Unknown error"),
                    "code": error.get("code", ""),
                },
            }

        return None

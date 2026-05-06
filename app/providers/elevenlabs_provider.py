"""ElevenLabs Conversational AI provider for ultra-low-latency voice synthesis.

Connects via WebSocket to the ElevenLabs convai endpoint.
Audio is streamed as base64-encoded chunks with server-side VAD.
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

ELEVENLABS_WS_URL = "wss://api.elevenlabs.io/v1/convai/conversation"


class ElevenLabsProvider(VoiceProviderBase):
    """Provider for ElevenLabs Conversational AI with ultra-low-latency voice synthesis.

    Lifecycle: connect() -> send_audio() <-> receive_events() -> disconnect()
    """

    def __init__(self) -> None:
        self._ws: ClientConnection | None = None
        self._session_id: str = ""
        self._conversation: ConversationState | None = None
        self._agent_id: str = ""

    async def connect(self, config: SessionConfig) -> None:
        self._session_id = str(uuid.uuid4())
        self._conversation = ConversationState(session_id=self._session_id)

        url = f"{ELEVENLABS_WS_URL}?xi-api-key={settings.elevenlabs_api_key}"

        logger.info("Connecting to ElevenLabs Conversational AI...")
        self._ws = await websockets.connect(url)

        # Send initialization config
        init_config = {
            "type": "conversation_initiation_client_data",
            "conversation_config_override": {
                "agent": {
                    "prompt": {
                        "prompt": config.system_prompt or settings.agent_persona,
                    },
                    "first_message": f"Hello! I'm {settings.agent_name}. How can I help you today?",
                    "language": "en",
                },
                "tts": {
                    "voice_id": settings.elevenlabs_voice_id,
                },
            },
        }
        await self._send_event(init_config)
        logger.info(f"ElevenLabs session initialized: {self._session_id}")

    async def disconnect(self) -> None:
        if self._ws:
            await self._ws.close()
            self._ws = None
            logger.info(f"Disconnected ElevenLabs session: {self._session_id}")

    async def send_audio(self, audio_data: bytes) -> None:
        if not self._ws:
            raise ConnectionError("Not connected to ElevenLabs")

        audio_b64 = base64.b64encode(audio_data).decode("utf-8")
        await self._send_event({
            "user_audio_chunk": audio_b64,
        })

    async def receive_events(self) -> AsyncIterator[dict[str, Any]]:
        if not self._ws:
            raise ConnectionError("Not connected to ElevenLabs")

        try:
            async for message in self._ws:
                event = json.loads(message)
                event_type = event.get("type", "")

                parsed = self._parse_event(event_type, event)
                if parsed:
                    yield parsed

        except websockets.exceptions.ConnectionClosed:
            logger.info("ElevenLabs WebSocket connection closed")
            yield {"type": "session.ended", "data": {"reason": "connection_closed"}}

    async def send_tool_result(self, call_id: str, result: str) -> None:
        # ElevenLabs doesn't have native tool calling in the same way;
        # tool results are sent as text context
        logger.info(f"Tool result for {call_id}: {result}")

    async def interrupt(self) -> None:
        if self._ws:
            await self._send_event({"type": "user_interrupt"})

    def get_conversation_state(self) -> ConversationState | None:
        return self._conversation

    async def _send_event(self, event: dict[str, Any]) -> None:
        if self._ws:
            await self._ws.send(json.dumps(event))

    def _parse_event(self, event_type: str, event: dict[str, Any]) -> dict[str, Any] | None:
        """Parse ElevenLabs events into normalized format."""
        if event_type == "conversation_initiation_metadata":
            self._agent_id = event.get("agent_id", "")
            return {
                "type": "session.created",
                "data": {
                    "session_id": self._session_id,
                    "agent_id": self._agent_id,
                },
            }

        if event_type == "audio":
            audio_data = event.get("audio_event", {})
            return {
                "type": "audio.delta",
                "data": {"audio": audio_data.get("audio_base_64", "")},
            }

        if event_type == "agent_response":
            text = event.get("agent_response_event", {}).get("agent_response", "")
            if self._conversation and text:
                self._conversation.add_message(MessageRole.ASSISTANT, text)
            return {
                "type": "transcript.done",
                "data": {"text": text, "role": "assistant"},
            }

        if event_type == "user_transcript":
            text = event.get("user_transcription_event", {}).get("user_transcript", "")
            if self._conversation and text:
                self._conversation.add_message(MessageRole.USER, text)
            return {
                "type": "transcript.done",
                "data": {"text": text, "role": "user"},
            }

        if event_type == "interruption":
            return {"type": "speech.started", "data": {}}

        if event_type == "ping":
            # Respond to keep-alive pings
            return None

        if event_type == "error":
            msg = event.get("error_message", "Unknown error")
            logger.error(f"ElevenLabs error: {msg}")
            return {
                "type": "error",
                "data": {"message": msg},
            }

        return None

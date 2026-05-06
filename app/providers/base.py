"""Abstract base class defining the voice provider interface.

All providers (GitHub Models, OpenAI Realtime, ElevenLabs) implement this
contract so the SessionManager can work with any backend transparently.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, AsyncIterator

from app.models.schemas import ConversationState, SessionConfig


class VoiceProviderBase(ABC):
    """Interface that every voice provider must implement.

    Providers manage their own connections and translate between the
    normalized event format used by SessionManager and the provider's
    native protocol.
    """

    @abstractmethod
    async def connect(self, config: SessionConfig) -> None:
        """Establish connection to the provider."""
        ...

    @abstractmethod
    async def disconnect(self) -> None:
        """Close the provider connection."""
        ...

    @abstractmethod
    async def send_audio(self, audio_data: bytes) -> None:
        """Send audio data to the provider for processing."""
        ...

    @abstractmethod
    async def receive_events(self) -> AsyncIterator[dict[str, Any]]:
        """Yield events from the provider (audio, text, tool calls, etc.)."""
        ...

    @abstractmethod
    async def send_tool_result(self, call_id: str, result: str) -> None:
        """Send a tool call result back to the provider."""
        ...

    @abstractmethod
    async def interrupt(self) -> None:
        """Interrupt the current response (e.g. when user starts speaking)."""
        ...

    @abstractmethod
    def get_conversation_state(self) -> ConversationState | None:
        """Return the current conversation state."""
        ...

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class MessageRole(str, Enum):
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"
    TOOL = "tool"


class ConversationMessage(BaseModel):
    role: MessageRole
    content: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    metadata: dict[str, Any] = Field(default_factory=dict)


class ToolCall(BaseModel):
    tool_name: str
    arguments: dict[str, Any]
    call_id: str


class ToolResult(BaseModel):
    call_id: str
    output: str
    success: bool = True


class SessionConfig(BaseModel):
    provider: str = "groq"
    voice: str = "en-US-AndrewMultilingualNeural"
    system_prompt: str = ""
    tools_enabled: bool = True
    turn_detection: bool = True


class ConversationState(BaseModel):
    session_id: str
    messages: list[ConversationMessage] = Field(default_factory=list)
    turn_count: int = 0
    created_at: datetime = Field(default_factory=datetime.utcnow)
    is_active: bool = True

    def add_message(self, role: MessageRole, content: str, **metadata: Any) -> None:
        self.messages.append(
            ConversationMessage(role=role, content=content, metadata=metadata)
        )
        if role == MessageRole.USER:
            self.turn_count += 1


class WebSocketMessage(BaseModel):
    type: str
    data: dict[str, Any] = Field(default_factory=dict)

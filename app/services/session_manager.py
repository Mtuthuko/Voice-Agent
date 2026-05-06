"""Session lifecycle management for voice agent conversations.

Bridges the browser WebSocket and the voice provider, handling bidirectional
event routing, tool execution, and graceful teardown.
"""

from __future__ import annotations

import asyncio
import json
from typing import Any

from fastapi import WebSocket

from app.core.logging import logger
from app.models.schemas import SessionConfig
from app.providers.base import VoiceProviderBase
from app.providers.factory import create_provider
from app.tools.registry import registry

# Ensure built-in tools are registered
import app.tools.built_in  # noqa: F401


class SessionManager:
    """Manages a single voice agent session, bridging the client WebSocket and voice provider."""

    def __init__(self, websocket: WebSocket, config: SessionConfig) -> None:
        self.websocket = websocket
        self.config = config
        self.provider: VoiceProviderBase = create_provider(config.provider)
        self._running = False

    async def start(self) -> None:
        """Start the voice session: connect to provider and run event loops."""
        self._running = True
        logger.info(f"Starting session with provider: {self.config.provider}")

        try:
            await self.provider.connect(self.config)
            await self._notify_client("session.started", {
                "provider": self.config.provider,
                "tools": registry.list_tools(),
            })

            # Run both loops concurrently
            await asyncio.gather(
                self._client_to_provider(),
                self._provider_to_client(),
            )
        except Exception as e:
            logger.error(f"Session error: {e}")
            await self._notify_client("error", {"message": str(e)})
        finally:
            await self.stop()

    async def stop(self) -> None:
        """Gracefully stop the session."""
        self._running = False
        try:
            await self.provider.disconnect()
        except Exception as e:
            logger.warning(f"Error during disconnect: {e}")
        logger.info("Session stopped")

    async def _client_to_provider(self) -> None:
        """Forward audio and commands from the browser client to the voice provider."""
        try:
            while self._running:
                data = await self.websocket.receive()

                if data.get("bytes"):
                    # Raw audio bytes from the client microphone
                    await self.provider.send_audio(data["bytes"])

                elif data.get("text"):
                    message = json.loads(data["text"])
                    msg_type = message.get("type", "")

                    if msg_type == "text.send":
                        # Text input fallback
                        text = message.get("text", "")
                        if hasattr(self.provider, "send_text"):
                            await self.provider.send_text(text)

                    elif msg_type == "audio.commit":
                        # Manual turn detection commit
                        if hasattr(self.provider, "commit_audio"):
                            await self.provider.commit_audio()

                    elif msg_type == "session.update":
                        logger.info(f"Session update: {message.get('data', {})}")

                    elif msg_type == "session.end":
                        self._running = False
                        break

        except Exception as e:
            logger.error(f"Client-to-provider error: {e}")
            self._running = False

    async def _provider_to_client(self) -> None:
        """Forward events from the voice provider to the browser client."""
        try:
            async for event in self.provider.receive_events():
                if not self._running:
                    break

                event_type = event.get("type", "")

                # Handle tool calls internally
                if event_type == "tool.call":
                    await self._handle_tool_call(event["data"])
                    continue

                # Forward all other events to the client
                await self._notify_client(event_type, event.get("data", {}))

                if event_type == "session.ended":
                    self._running = False
                    break

        except Exception as e:
            logger.error(f"Provider-to-client error: {e}")
            self._running = False

    async def _handle_tool_call(self, data: dict[str, Any]) -> None:
        """Execute a tool call and send the result back to the provider."""
        call_id = data.get("call_id", "")
        tool_name = data.get("name", "")
        arguments_str = data.get("arguments", "{}")

        logger.info(f"Tool call: {tool_name}({arguments_str})")

        # Notify client about the tool call
        await self._notify_client("tool.calling", {
            "name": tool_name,
            "arguments": arguments_str,
        })

        try:
            arguments = json.loads(arguments_str)
            result = await registry.execute(tool_name, arguments)
        except json.JSONDecodeError:
            result = json.dumps({"error": f"Invalid arguments: {arguments_str}"})

        logger.info(f"Tool result: {result[:200]}")

        # Notify client about the result
        await self._notify_client("tool.result", {
            "name": tool_name,
            "result": result,
        })

        # Send result back to provider so it can continue the response
        await self.provider.send_tool_result(call_id, result)

    async def _notify_client(self, event_type: str, data: dict[str, Any]) -> None:
        """Send a JSON event to the browser client."""
        try:
            await self.websocket.send_json({"type": event_type, "data": data})
        except Exception:
            self._running = False

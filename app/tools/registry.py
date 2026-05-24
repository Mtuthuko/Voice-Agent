"""Decorator-based tool registry that generates OpenAI function calling schemas.

Register tools with ``@registry.register(...)`` and they become available
to any voice provider that supports function calling.
"""

from __future__ import annotations

import json
from typing import Any, Callable, Coroutine

from app.core.logging import logger

ToolFunction = Callable[..., Coroutine[Any, Any, str]]


class ToolDefinition:
    """Metadata and handler for a single registered tool."""

    __slots__ = ("name", "description", "parameters", "handler")

    def __init__(
        self,
        name: str,
        description: str,
        parameters: dict[str, Any],
        handler: ToolFunction,
    ) -> None:
        self.name = name
        self.description = description
        self.parameters = parameters
        self.handler = handler

    def to_openai_schema(self) -> dict[str, Any]:
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.parameters,
            },
        }


class ToolRegistry:
    """Central registry mapping tool names to their definitions and handlers."""

    def __init__(self) -> None:
        self._tools: dict[str, ToolDefinition] = {}

    def register(
        self,
        name: str,
        description: str,
        parameters: dict[str, Any],
    ) -> Callable[[ToolFunction], ToolFunction]:
        def decorator(func: ToolFunction) -> ToolFunction:
            self._tools[name] = ToolDefinition(
                name=name,
                description=description,
                parameters=parameters,
                handler=func,
            )
            logger.info(f"Registered tool: {name}")
            return func
        return decorator

    async def execute(self, name: str, arguments: dict[str, Any]) -> str:
        tool = self._tools.get(name)
        if not tool:
            return json.dumps({"error": f"Unknown tool: {name}"})
        try:
            result = await tool.handler(**arguments)
            return result
        except Exception as e:
            logger.error(f"Tool execution error [{name}]: {e}")
            return json.dumps({"error": str(e)})

    def get_openai_schemas(self) -> list[dict[str, Any]]:
        return [tool.to_openai_schema() for tool in self._tools.values()]

    def get_realtime_schemas(self) -> list[dict[str, Any]]:
        """Flat format for the OpenAI Realtime API (no 'function' wrapper)."""
        return [
            {
                "type": "function",
                "name": tool.name,
                "description": tool.description,
                "parameters": tool.parameters,
            }
            for tool in self._tools.values()
        ]

    def list_tools(self) -> list[str]:
        return list(self._tools.keys())


registry = ToolRegistry()

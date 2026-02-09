"""Tests for the tool registry and built-in tools."""
import json

import pytest

from app.tools.registry import ToolRegistry, registry

# Ensure built-in tools are loaded
import app.tools.built_in  # noqa: F401


class TestToolRegistry:
    def test_list_tools(self):
        tools = registry.list_tools()
        assert "get_weather" in tools
        assert "calculate" in tools
        assert "get_datetime" in tools
        assert "lookup_knowledge" in tools

    def test_get_openai_schemas(self):
        schemas = registry.get_openai_schemas()
        assert len(schemas) >= 4
        for schema in schemas:
            assert schema["type"] == "function"
            assert "name" in schema
            assert "description" in schema
            assert "parameters" in schema

    def test_register_custom_tool(self):
        custom_registry = ToolRegistry()

        @custom_registry.register(
            name="test_tool",
            description="A test tool",
            parameters={"type": "object", "properties": {}},
        )
        async def test_tool():
            return "ok"

        assert "test_tool" in custom_registry.list_tools()

    @pytest.mark.asyncio
    async def test_execute_unknown_tool(self):
        result = await registry.execute("nonexistent_tool", {})
        data = json.loads(result)
        assert "error" in data


class TestCalculateTool:
    @pytest.mark.asyncio
    async def test_basic_arithmetic(self):
        result = await registry.execute("calculate", {"expression": "2 + 3"})
        data = json.loads(result)
        assert data["result"] == 5

    @pytest.mark.asyncio
    async def test_math_functions(self):
        result = await registry.execute("calculate", {"expression": "sqrt(144)"})
        data = json.loads(result)
        assert data["result"] == 12.0

    @pytest.mark.asyncio
    async def test_invalid_expression(self):
        result = await registry.execute("calculate", {"expression": "invalid"})
        data = json.loads(result)
        assert "error" in data


class TestDatetimeTool:
    @pytest.mark.asyncio
    async def test_get_datetime(self):
        result = await registry.execute("get_datetime", {})
        data = json.loads(result)
        assert "datetime" in data
        assert "date" in data
        assert "time" in data


class TestKnowledgeTool:
    @pytest.mark.asyncio
    async def test_lookup_found(self):
        result = await registry.execute("lookup_knowledge", {"query": "voice agent"})
        data = json.loads(result)
        assert data["count"] > 0

    @pytest.mark.asyncio
    async def test_lookup_not_found(self):
        result = await registry.execute("lookup_knowledge", {"query": "xyzabc123"})
        data = json.loads(result)
        assert data["count"] == 0

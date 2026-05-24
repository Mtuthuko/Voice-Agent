"""Tests for the FastAPI endpoints."""
import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


class TestHealthEndpoint:
    def test_health_check(self):
        response = client.get("/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert "agent" in data
        assert "provider" in data

    def test_health_includes_uptime(self):
        response = client.get("/api/health")
        data = response.json()
        assert "uptime_seconds" in data
        assert isinstance(data["uptime_seconds"], int)


class TestReadinessEndpoint:
    def test_readiness_returns_provider(self):
        response = client.get("/api/ready")
        data = response.json()
        assert "ready" in data
        assert "provider" in data
        assert "reason" in data

    def test_readiness_structure(self):
        response = client.get("/api/ready")
        data = response.json()
        assert "ready" in data
        assert isinstance(data["ready"], bool)
        assert response.status_code in (200, 503)


class TestConfigEndpoint:
    def test_get_config(self):
        response = client.get("/api/config")
        assert response.status_code == 200
        data = response.json()
        assert "agent_name" in data
        assert "provider" in data
        assert "tools" in data
        assert isinstance(data["tools"], list)
        assert "mode" in data


class TestSecurityHeaders:
    def test_security_headers_present(self):
        response = client.get("/api/health")
        assert response.headers["X-Content-Type-Options"] == "nosniff"
        assert response.headers["X-Frame-Options"] == "DENY"
        assert response.headers["X-XSS-Protection"] == "1; mode=block"
        assert response.headers["Referrer-Policy"] == "strict-origin-when-cross-origin"
        assert response.headers["Permissions-Policy"] == "microphone=(self)"

    def test_correlation_id_header(self):
        response = client.get("/api/config")
        assert "X-Correlation-ID" in response.headers
        assert len(response.headers["X-Correlation-ID"]) > 0


class TestIndexPage:
    def test_index_page(self):
        response = client.get("/")
        assert response.status_code == 200
        assert "text/html" in response.headers["content-type"]
        assert "Atlas" in response.text


class TestModels:
    def test_conversation_state(self):
        from app.models.schemas import ConversationState, MessageRole

        state = ConversationState(session_id="test-123")
        assert state.turn_count == 0
        assert state.is_active

        state.add_message(MessageRole.USER, "Hello")
        assert state.turn_count == 1
        assert len(state.messages) == 1

        state.add_message(MessageRole.ASSISTANT, "Hi there")
        assert state.turn_count == 1  # Only user messages increment turns
        assert len(state.messages) == 2

    def test_session_config(self):
        from app.models.schemas import SessionConfig

        config = SessionConfig()
        assert config.provider == "groq"
        assert config.tools_enabled is True

    def test_provider_factory(self):
        from app.providers.factory import create_provider
        from app.providers.groq_provider import GroqProvider
        from app.providers.github_models import GitHubModelsProvider
        from app.providers.openai_realtime import OpenAIRealtimeProvider
        from app.providers.elevenlabs_provider import ElevenLabsProvider

        groq_provider = create_provider("groq")
        assert isinstance(groq_provider, GroqProvider)

        github_provider = create_provider("github")
        assert isinstance(github_provider, GitHubModelsProvider)

        openai_provider = create_provider("openai")
        assert isinstance(openai_provider, OpenAIRealtimeProvider)

        elevenlabs_provider = create_provider("elevenlabs")
        assert isinstance(elevenlabs_provider, ElevenLabsProvider)

    def test_invalid_provider(self):
        from app.providers.factory import create_provider

        with pytest.raises(ValueError):
            create_provider("invalid_provider")

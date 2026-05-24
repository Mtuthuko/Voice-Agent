"""API routes for health checks, configuration, and WebSocket voice communication."""

from __future__ import annotations

import time

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.core.logging import logger
from app.models.schemas import SessionConfig
from app.services.session_manager import SessionManager
from app.tools.registry import registry

router = APIRouter()

_start_time = time.monotonic()


@router.get("/api/health")
async def health_check() -> JSONResponse:
    """Liveness probe: confirms the service is running."""
    return JSONResponse({
        "status": "healthy",
        "agent": settings.agent_name,
        "provider": settings.voice_provider.value,
        "uptime_seconds": round(time.monotonic() - _start_time),
    })


def _has_real_key(value: str) -> bool:
    """Check if an API key is set to a real value (not a placeholder)."""
    if not value:
        return False
    placeholders = {"your-", "ghp_your", "sk-your", "gsk_your"}
    return not any(p in value for p in placeholders)


@router.get("/api/ready")
async def readiness_check() -> JSONResponse:
    """Readiness probe: confirms the service can accept requests."""
    provider = settings.voice_provider.value
    ready = True
    reason = "ok"

    if provider == "groq" and not _has_real_key(settings.groq_api_key):
        ready = False
        reason = "GROQ_API_KEY not configured"
    elif provider == "github" and not _has_real_key(settings.github_token):
        ready = False
        reason = "GITHUB_TOKEN not configured"
    elif provider == "openai" and not _has_real_key(settings.openai_api_key):
        ready = False
        reason = "OPENAI_API_KEY not configured"
    elif provider == "elevenlabs" and not _has_real_key(settings.elevenlabs_api_key):
        ready = False
        reason = "ELEVENLABS_API_KEY not configured"

    status_code = 200 if ready else 503
    return JSONResponse(
        {"ready": ready, "provider": provider, "reason": reason},
        status_code=status_code,
    )


@router.get("/api/config")
async def get_config() -> JSONResponse:
    """Return public configuration for the frontend (no secrets)."""
    return JSONResponse({
        "agent_name": settings.agent_name,
        "provider": settings.voice_provider.value,
        "voice": (
            settings.groq_tts_voice if settings.voice_provider.value == "groq"
            else settings.github_tts_voice if settings.voice_provider.value == "github"
            else settings.openai_voice if settings.voice_provider.value == "openai"
            else settings.elevenlabs_voice_id
        ),
        "mode": "pipeline" if settings.voice_provider.value in ("groq", "github") else "realtime",
        "tools": registry.list_tools(),
        "max_turns": settings.max_conversation_turns,
    })


@router.websocket("/ws/voice")
async def voice_websocket(websocket: WebSocket) -> None:
    """Main WebSocket endpoint for real-time voice communication.

    Protocol:
        1. Client connects and sends a JSON config message.
        2. Server creates a SessionManager and begins bidirectional streaming.
        3. Client sends audio bytes (realtime) or text.send messages (pipeline).
        4. Server streams back transcript, audio, and tool events.
        5. Either side can close the connection.
    """
    await websocket.accept()
    logger.info("Client connected to voice WebSocket")

    try:
        init_data = await websocket.receive_json()
        provider_val = init_data.get("provider", settings.voice_provider.value)
        default_voice = (
            settings.groq_tts_voice if provider_val == "groq"
            else settings.github_tts_voice if provider_val == "github"
            else settings.openai_voice if provider_val == "openai"
            else settings.elevenlabs_voice_id
        )
        config = SessionConfig(
            provider=provider_val,
            voice=init_data.get("voice", default_voice),
            system_prompt=init_data.get("system_prompt", ""),
            tools_enabled=init_data.get("tools_enabled", True),
            turn_detection=init_data.get("turn_detection", True),
        )

        session = SessionManager(websocket, config)
        await session.start()

    except WebSocketDisconnect:
        logger.info("Client disconnected")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        try:
            await websocket.send_json({"type": "error", "data": {"message": str(e)}})
        except Exception:
            pass

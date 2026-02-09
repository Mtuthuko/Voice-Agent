from __future__ import annotations

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.core.logging import logger
from app.models.schemas import SessionConfig
from app.services.session_manager import SessionManager
from app.tools.registry import registry

router = APIRouter()


@router.get("/api/health")
async def health_check() -> JSONResponse:
    return JSONResponse({
        "status": "healthy",
        "agent": settings.agent_name,
        "provider": settings.voice_provider.value,
    })


@router.get("/api/config")
async def get_config() -> JSONResponse:
    """Return public configuration for the frontend."""
    return JSONResponse({
        "agent_name": settings.agent_name,
        "provider": settings.voice_provider.value,
        "voice": settings.openai_voice if settings.voice_provider.value == "openai" else settings.elevenlabs_voice_id,
        "tools": registry.list_tools(),
        "max_turns": settings.max_conversation_turns,
    })


@router.websocket("/ws/voice")
async def voice_websocket(websocket: WebSocket) -> None:
    """Main WebSocket endpoint for real-time voice communication."""
    await websocket.accept()
    logger.info("Client connected to voice WebSocket")

    try:
        # Receive initial config from client
        init_data = await websocket.receive_json()
        config = SessionConfig(
            provider=init_data.get("provider", settings.voice_provider.value),
            voice=init_data.get("voice", settings.openai_voice),
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

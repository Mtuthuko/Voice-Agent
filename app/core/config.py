from __future__ import annotations

from enum import Enum

from pydantic_settings import BaseSettings


class VoiceProvider(str, Enum):
    OPENAI = "openai"
    ELEVENLABS = "elevenlabs"


class Settings(BaseSettings):
    # Provider
    voice_provider: VoiceProvider = VoiceProvider.OPENAI

    # OpenAI
    openai_api_key: str = ""
    openai_realtime_model: str = "gpt-4o-realtime-preview"
    openai_voice: str = "alloy"

    # ElevenLabs
    elevenlabs_api_key: str = ""
    elevenlabs_voice_id: str = "21m00Tcm4TlvDq8ikWAM"
    elevenlabs_model_id: str = "eleven_turbo_v2"

    # App
    app_host: str = "0.0.0.0"
    app_port: int = 8000
    app_env: str = "development"
    log_level: str = "info"

    # Agent
    agent_name: str = "Atlas"
    agent_persona: str = (
        "You are Atlas, a helpful and knowledgeable AI voice assistant. "
        "You speak naturally and conversationally. You are concise but thorough. "
        "You can help with general knowledge, weather information, calculations, "
        "and answering questions. When using tools, relay the results naturally."
    )
    max_conversation_turns: int = 50
    turn_detection_threshold: float = 0.5

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()

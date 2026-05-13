"""Application configuration management using Pydantic Settings.

Loads configuration from environment variables and .env files with validation.
Supports three voice providers: GitHub Models (free), OpenAI Realtime, and ElevenLabs.
"""

from __future__ import annotations

from enum import Enum
from typing import Literal

from pydantic import Field, computed_field
from pydantic_settings import BaseSettings


class VoiceProvider(str, Enum):
    """Supported voice provider backends."""

    GROQ = "groq"
    GITHUB = "github"
    OPENAI = "openai"
    ELEVENLABS = "elevenlabs"


class Settings(BaseSettings):
    """Application settings with environment variable support.

    All settings can be overridden via environment variables or a .env file.
    Sensitive values (tokens, API keys) should only be set via environment
    variables, never committed to source control.
    """

    # --- Provider Selection ---
    voice_provider: VoiceProvider = VoiceProvider.GROQ

    # --- Groq (free, ultra-fast open-source model inference) ---
    groq_api_key: str = ""
    groq_model: str = "llama-3.3-70b-versatile"
    groq_tts_voice: str = "en-US-AndrewMultilingualNeural"

    # --- GitHub Models (free via GitHub Marketplace) ---
    github_token: str = ""
    github_models_endpoint: str = "https://models.github.ai/inference"
    github_model: str = "openai/gpt-4o"
    github_tts_voice: str = "en-US-AndrewMultilingualNeural"

    # --- OpenAI ---
    openai_api_key: str = ""
    openai_realtime_model: str = "gpt-4o-realtime-preview"
    openai_voice: str = "alloy"

    # --- ElevenLabs ---
    elevenlabs_api_key: str = ""
    elevenlabs_voice_id: str = "21m00Tcm4TlvDq8ikWAM"
    elevenlabs_model_id: str = "eleven_turbo_v2"

    # --- Application ---
    app_host: str = "0.0.0.0"
    app_port: int = Field(default=8000, ge=1, le=65535)
    app_env: Literal["development", "staging", "production"] = "development"
    log_level: Literal["debug", "info", "warning", "error", "critical"] = "info"
    allowed_origins: str = "*"

    # --- Agent ---
    agent_name: str = "Atlas"
    agent_persona: str = (
        "You are Atlas, a helpful and knowledgeable AI voice assistant. "
        "You speak naturally and conversationally. You are concise but thorough. "
        "You can help with general knowledge, weather information, calculations, "
        "and answering questions. When using tools, relay the results naturally."
    )
    max_conversation_turns: int = Field(default=50, ge=1, le=500)
    turn_detection_threshold: float = Field(default=0.5, ge=0.0, le=1.0)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def cors_origins(self) -> list[str]:
        """Parse comma-separated origins into a list."""
        if self.allowed_origins == "*":
            return ["*"]
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]

    @computed_field  # type: ignore[prop-decorator]
    @property
    def is_production(self) -> bool:
        """Check if running in production environment."""
        return self.app_env == "production"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()

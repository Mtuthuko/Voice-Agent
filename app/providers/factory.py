from __future__ import annotations

from app.core.config import VoiceProvider
from app.providers.base import VoiceProviderBase
from app.providers.elevenlabs_provider import ElevenLabsProvider
from app.providers.github_models import GitHubModelsProvider
from app.providers.openai_realtime import OpenAIRealtimeProvider


def create_provider(provider_type: str | VoiceProvider) -> VoiceProviderBase:
    """Factory to create the appropriate voice provider."""
    if isinstance(provider_type, str):
        provider_type = VoiceProvider(provider_type)

    providers = {
        VoiceProvider.GITHUB: GitHubModelsProvider,
        VoiceProvider.OPENAI: OpenAIRealtimeProvider,
        VoiceProvider.ELEVENLABS: ElevenLabsProvider,
    }

    provider_cls = providers.get(provider_type)
    if not provider_cls:
        raise ValueError(f"Unknown provider: {provider_type}")

    return provider_cls()

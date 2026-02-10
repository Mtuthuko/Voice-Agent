# Atlas - Conversational Voice Agent

A production-ready conversational voice AI agent built with **FastAPI**, **GitHub Models** (free GPT-4o), **Edge-TTS**, **OpenAI Realtime API**, and **ElevenLabs**. Features real-time voice conversation, tool calling, and a web-based interface with live audio visualization.

![Python](https://img.shields.io/badge/Python-3.10+-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688?logo=fastapi&logoColor=white)
![GitHub Models](https://img.shields.io/badge/GitHub_Models-GPT--4o_Free-181717?logo=github&logoColor=white)
![OpenAI](https://img.shields.io/badge/OpenAI-Realtime_API-412991?logo=openai&logoColor=white)
![ElevenLabs](https://img.shields.io/badge/ElevenLabs-Conversational_AI-000000)
![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green)

## Architecture

The system supports two modes: **Pipeline** (free) and **Realtime** (paid API keys).

```
                     Browser Client
                    (Audio + WebSocket)
                          |
                    ┌─────┴─────┐
                    │  FastAPI   │
                    │  Server    │
                    │            │
                    │ WebSocket  │
                    │  Handler   │
                    └─────┬─────┘
                          |
                 ┌────────┴────────┐
                 │ Session Manager  │
                 │                  │
                 │  ┌────────────┐  │
                 │  │ Tool       │  │
                 │  │ Registry   │  │
                 │  └────────────┘  │
                 └────────┬────────┘
                          |
          ┌───────────────┼───────────────┐
          |               |               |
┌─────────┴────────┐ ┌───┴────────┐ ┌────┴──────────┐
│  GitHub Models    │ │  OpenAI    │ │  ElevenLabs   │
│  (FREE)           │ │  Realtime  │ │  Provider     │
│                   │ │  Provider  │ │               │
│  Browser STT ──►  │ │            │ │               │
│  GitHub GPT-4o ►  │ │ Voice-to-  │ │ Ultra-low     │
│  Edge-TTS ──►     │ │ Voice      │ │ latency TTS   │
│  Audio playback   │ │ Server VAD │ │ Conversational│
│                   │ │ Tool calls │ │ AI            │
└───────────────────┘ └────────────┘ └───────────────┘
```

### Pipeline Mode (GitHub Models - Free)

```
User speaks → Browser Web Speech API (STT) → text → WebSocket →
→ GitHub Models API (GPT-4o) → response text → Edge-TTS (free) →
→ MP3 audio → WebSocket → Browser playback
```

### Realtime Mode (OpenAI / ElevenLabs)

```
User speaks → PCM16 audio → WebSocket →
→ Provider (STT + LLM + TTS in one stream) →
→ PCM16 audio → WebSocket → Browser playback
```

## Features

- **Three Provider Support** - GitHub Models (free), OpenAI Realtime API, or ElevenLabs
- **Zero-Cost Voice AI** - Full voice agent with just a free GitHub token (no paid API keys required)
- **Tool Calling** - Extensible tool system with built-in weather, calculator, datetime, and knowledge lookup
- **Web Interface** - Browser-based client with real-time audio waveform visualization
- **Dual Audio Modes** - MP3 streaming (pipeline) or PCM16 raw audio (realtime)
- **Browser STT** - Client-side speech recognition via Web Speech API (pipeline mode)
- **Edge-TTS** - Free, high-quality text-to-speech with 6+ voice options
- **Text Fallback** - Type messages when voice isn't available
- **Conversation Memory** - Full conversation state tracking per session
- **Provider Abstraction** - Clean interface pattern for adding new voice providers
- **Docker Ready** - One-command deployment with Docker Compose

## Built-in Tools

| Tool | Description |
|------|-------------|
| `get_weather` | Live weather data via Open-Meteo (no API key needed) |
| `calculate` | Safe math expression evaluation |
| `get_datetime` | Current UTC date and time |
| `lookup_knowledge` | Knowledge base search (extensible to vector DB) |

## Quick Start

### Prerequisites

- Python 3.10+
- A [GitHub Personal Access Token](https://github.com/settings/tokens) (free!) with `models:read` permission

> **No paid API keys needed!** The default GitHub Models provider gives you free access to GPT-4o and Edge-TTS provides free text-to-speech.

### Installation

```bash
# Clone the repository
git clone https://github.com/Mtuthuko/Voice-Agent.git
cd Voice-Agent

# Create virtual environment
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env → set GITHUB_TOKEN=ghp_your-token-here
```

### Get a GitHub Token

1. Go to [GitHub Settings → Developer Settings → Personal Access Tokens → Fine-grained tokens](https://github.com/settings/personal-access-tokens/new)
2. Create a token with **"Models: Read"** permission
3. Copy the token into your `.env` file as `GITHUB_TOKEN`

### Run

```bash
# Development server with hot reload
python run.py

# Or directly with uvicorn
uvicorn app.main:app --reload --port 8000
```

Open [http://localhost:8000](http://localhost:8000) in your browser.

### Docker

```bash
# Build and run
docker compose up --build

# Or run in background
docker compose up -d
```

## Usage

1. **Connect** - Click "Connect" to establish a WebSocket session
2. **Speak** - Click the microphone button and start talking. In pipeline mode, your browser transcribes your speech automatically
3. **Listen** - The agent responds with natural speech via Edge-TTS. Watch the audio visualizer react to the conversation
4. **Tools** - Ask about the weather, do math, or look up information. The agent calls the appropriate tool and relays results naturally
5. **Text** - Type a message as a fallback when voice isn't available

### Voice Options (Edge-TTS)

| Voice | Description |
|-------|-------------|
| `en-US-AndrewMultilingualNeural` | Andrew - American English (default) |
| `en-US-AvaMultilingualNeural` | Ava - American English |
| `en-US-BrianMultilingualNeural` | Brian - American English |
| `en-US-EmmaMultilingualNeural` | Emma - American English |
| `en-GB-SoniaNeural` | Sonia - British English |
| `en-ZA-LeahNeural` | Leah - South African English |

## Project Structure

```
Voice-Agent/
├── app/
│   ├── api/
│   │   └── routes.py              # HTTP + WebSocket endpoints
│   ├── core/
│   │   ├── config.py              # Pydantic settings management
│   │   └── logging.py             # Structured logging
│   ├── models/
│   │   └── schemas.py             # Pydantic models
│   ├── providers/
│   │   ├── base.py                # Abstract provider interface
│   │   ├── github_models.py       # GitHub Models + Edge-TTS pipeline
│   │   ├── openai_realtime.py     # OpenAI Realtime API integration
│   │   ├── elevenlabs_provider.py # ElevenLabs integration
│   │   └── factory.py             # Provider factory
│   ├── services/
│   │   └── session_manager.py     # Session orchestration + tool execution
│   ├── tools/
│   │   ├── registry.py            # Tool registration system
│   │   └── built_in.py            # Built-in tool implementations
│   └── main.py                    # FastAPI application
├── frontend/
│   ├── static/
│   │   ├── css/styles.css         # UI styles
│   │   └── js/
│   │       ├── app.js             # Main controller (pipeline + realtime)
│   │       ├── audio-processor.js # Mic capture + PCM16 conversion
│   │       └── visualizer.js      # Real-time audio visualization
│   └── templates/
│       └── index.html             # Web interface
├── tests/
│   ├── test_api.py                # API endpoint tests
│   └── test_tools.py              # Tool system tests
├── docker-compose.yml
├── Dockerfile
├── pyproject.toml
├── requirements.txt
└── run.py
```

## Adding Custom Tools

Extend the agent with new capabilities by registering tools:

```python
from app.tools.registry import registry

@registry.register(
    name="search_database",
    description="Search the product database by query",
    parameters={
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "Search query"},
            "limit": {"type": "integer", "description": "Max results"},
        },
        "required": ["query"],
    },
)
async def search_database(query: str, limit: int = 5) -> str:
    # Your implementation here
    results = await db.search(query, limit=limit)
    return json.dumps({"results": results})
```

Tools are automatically available to the voice agent and generate OpenAI-compatible function calling schemas.

## Configuration

All settings are managed via environment variables (see `.env.example`):

| Variable | Default | Description |
|----------|---------|-------------|
| `VOICE_PROVIDER` | `github` | Provider: `github`, `openai`, or `elevenlabs` |
| `GITHUB_TOKEN` | - | GitHub PAT with `models:read` permission (free) |
| `GITHUB_MODEL` | `openai/gpt-4o` | GitHub Models model ID |
| `GITHUB_TTS_VOICE` | `en-US-AndrewMultilingualNeural` | Edge-TTS voice |
| `OPENAI_API_KEY` | - | OpenAI API key (for realtime mode) |
| `OPENAI_REALTIME_MODEL` | `gpt-4o-realtime-preview` | OpenAI model |
| `OPENAI_VOICE` | `alloy` | OpenAI voice |
| `ELEVENLABS_API_KEY` | - | ElevenLabs API key |
| `AGENT_NAME` | `Atlas` | Agent display name |
| `AGENT_PERSONA` | (see .env.example) | System prompt / persona |
| `APP_PORT` | `8000` | Server port |

## Testing

```bash
# Install dev dependencies
pip install -e ".[dev]"

# Run tests
pytest

# Run with coverage
pytest --cov=app --cov-report=term-missing
```

## Tech Stack

- **Backend**: Python, FastAPI, WebSockets, Pydantic
- **LLM**: GitHub Models (free GPT-4o), OpenAI Realtime API
- **TTS**: Edge-TTS (free), OpenAI TTS, ElevenLabs
- **STT**: Web Speech API (browser, free), OpenAI Whisper
- **Audio**: PCM16/MP3 streaming, Web Audio API
- **Frontend**: Vanilla JS, Canvas API (audio visualization)
- **Infrastructure**: Docker, Docker Compose, uvicorn

## License

MIT License - see [LICENSE](LICENSE) for details.

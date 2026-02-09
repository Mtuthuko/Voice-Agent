# Atlas - Conversational Voice Agent

A production-ready, real-time conversational voice AI agent built with **FastAPI**, **OpenAI Realtime API**, and **ElevenLabs Conversational AI**. Features low-latency voice-to-voice communication, tool calling, and a web-based interface with live audio visualization.

![Python](https://img.shields.io/badge/Python-3.10+-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688?logo=fastapi&logoColor=white)
![OpenAI](https://img.shields.io/badge/OpenAI-Realtime_API-412991?logo=openai&logoColor=white)
![ElevenLabs](https://img.shields.io/badge/ElevenLabs-Conversational_AI-000000)
![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green)

## Architecture

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
              ┌───────────┴───────────┐
              |                       |
    ┌─────────┴─────────┐  ┌─────────┴─────────┐
    │  OpenAI Realtime   │  │    ElevenLabs      │
    │  Provider          │  │    Provider         │
    │                    │  │                     │
    │  - Voice-to-Voice  │  │  - Ultra-low TTS    │
    │  - Server VAD      │  │  - Voice cloning    │
    │  - Tool calling    │  │  - Conversational   │
    │  - Whisper STT     │  │    AI               │
    └────────────────────┘  └─────────────────────┘
```

## Features

- **Dual Provider Support** - Switch between OpenAI Realtime API and ElevenLabs at runtime
- **Real-Time Voice-to-Voice** - Sub-second latency using WebSocket streaming with PCM16 audio
- **Server-Side VAD** - Automatic voice activity detection with configurable threshold
- **Tool Calling** - Extensible tool system with built-in weather, calculator, datetime, and knowledge lookup
- **Web Interface** - Browser-based client with real-time audio waveform visualization
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
- An [OpenAI API key](https://platform.openai.com/api-keys) with Realtime API access
- (Optional) An [ElevenLabs API key](https://elevenlabs.io/) for the ElevenLabs provider

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
# Edit .env with your API keys
```

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

1. **Connect** - Click "Connect" to establish a WebSocket session with the selected provider
2. **Speak** - Click the microphone button and start talking. The agent uses server-side voice activity detection to know when you've finished speaking
3. **Listen** - The agent responds with natural speech, streamed in real-time. Watch the audio visualizer react to the conversation
4. **Tools** - Ask about the weather, do math, or look up information. The agent will call the appropriate tool and relay the results conversationally
5. **Text** - Type a message as a fallback when voice isn't available

## Project Structure

```
Voice-Agent/
├── app/
│   ├── api/
│   │   └── routes.py          # HTTP + WebSocket endpoints
│   ├── core/
│   │   ├── config.py          # Pydantic settings management
│   │   └── logging.py         # Structured logging
│   ├── models/
│   │   └── schemas.py         # Pydantic models
│   ├── providers/
│   │   ├── base.py            # Abstract provider interface
│   │   ├── openai_realtime.py # OpenAI Realtime API integration
│   │   ├── elevenlabs_provider.py  # ElevenLabs integration
│   │   └── factory.py         # Provider factory
│   ├── services/
│   │   └── session_manager.py # Session orchestration + tool execution
│   ├── tools/
│   │   ├── registry.py        # Tool registration system
│   │   └── built_in.py        # Built-in tool implementations
│   └── main.py                # FastAPI application
├── frontend/
│   ├── static/
│   │   ├── css/styles.css     # UI styles
│   │   └── js/
│   │       ├── app.js         # Main application controller
│   │       ├── audio-processor.js  # Mic capture + PCM16 conversion
│   │       └── visualizer.js  # Real-time audio visualization
│   └── templates/
│       └── index.html         # Web interface
├── tests/
│   ├── test_api.py            # API endpoint tests
│   └── test_tools.py          # Tool system tests
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

Tools are automatically available to the voice agent and appear in the OpenAI Realtime function calling schema.

## Configuration

All settings are managed via environment variables (see `.env.example`):

| Variable | Default | Description |
|----------|---------|-------------|
| `VOICE_PROVIDER` | `openai` | Provider: `openai` or `elevenlabs` |
| `OPENAI_API_KEY` | - | OpenAI API key |
| `OPENAI_REALTIME_MODEL` | `gpt-4o-realtime-preview` | OpenAI model |
| `OPENAI_VOICE` | `alloy` | Voice: alloy, echo, fable, onyx, nova, shimmer |
| `ELEVENLABS_API_KEY` | - | ElevenLabs API key |
| `ELEVENLABS_VOICE_ID` | `21m00Tcm4TlvDq8ikWAM` | ElevenLabs voice ID |
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
- **Voice Providers**: OpenAI Realtime API, ElevenLabs Conversational AI
- **Audio**: PCM16 at 24kHz, Web Audio API, Server-Side VAD
- **Frontend**: Vanilla JS, Canvas API (audio visualization)
- **Infrastructure**: Docker, Docker Compose, uvicorn

## License

MIT License - see [LICENSE](LICENSE) for details.

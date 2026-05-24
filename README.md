# Atlas - Conversational Voice Agent

A production-ready conversational voice AI agent powered by **open-source models** (Llama 3.3 70B via Groq) with **streaming LLM + sentence-chunked TTS** for natural, low-latency conversation. Built with FastAPI, WebSockets, and a real-time browser interface.

![Python](https://img.shields.io/badge/Python-3.10+-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688?logo=fastapi&logoColor=white)
![Groq](https://img.shields.io/badge/Groq-Llama_3.3_70B-f55036?logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCI+PHRleHQgeT0iMjAiIGZvbnQtc2l6ZT0iMjAiPuKaqTwvdGV4dD48L3N2Zz4=&logoColor=white)
![Open Source](https://img.shields.io/badge/LLM-Open_Source-brightgreen)
![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)
![Tests](https://img.shields.io/badge/Tests-22_passing-brightgreen)
![License](https://img.shields.io/badge/License-MIT-green)

## Why This Project

Most voice AI demos feel robotic — they wait for the full LLM response before speaking. Atlas uses **streaming inference + sentence-chunked TTS** to start speaking within ~500ms of the first complete sentence, creating a natural conversational flow similar to true speech-to-speech models.

**Key differentiators:**
- **Fully free** — runs on Groq's free API with open-source Llama 3.3 70B
- **Low latency** — streaming architecture, not batch-and-wait
- **Barge-in support** — interrupt the agent mid-sentence by speaking
- **4 provider backends** — swap between Groq, GitHub Models, OpenAI Realtime, or ElevenLabs
- **Extensible tools** — decorator-based tool registry with OpenAI function calling

## Architecture

```
                        Browser Client
                   ┌─────────────────────┐
                   │  Web Speech API      │ ◄── STT (client-side)
                   │  Audio Visualizer    │
                   │  MP3/PCM Playback    │
                   └──────────┬──────────┘
                              │ WebSocket
                   ┌──────────┴──────────┐
                   │     FastAPI Server    │
                   │                      │
                   │  Session Manager     │
                   │  Tool Executor       │
                   │  Security Middleware  │
                   │  Correlation Tracing  │
                   └──────────┬──────────┘
                              │
        ┌─────────┬───────────┼───────────┬─────────────┐
        │         │           │           │             │
   ┌────┴───┐ ┌───┴────┐ ┌───┴────┐ ┌────┴──────┐      │
   │  Groq  │ │ GitHub │ │ OpenAI │ │ ElevenLabs│  ┌───┴────┐
   │ Llama  │ │ Models │ │Realtime│ │ Provider  │  │Edge-TTS│
   │ 3.3 70B│ │ GPT-4o │ │  API   │ │           │  │ (free) │
   │ (free) │ │ (free) │ │ (paid) │ │  (paid)   │  └────────┘
   └────────┘ └────────┘ └────────┘ └───────────┘
       ▲ default
```

### Streaming Pipeline (Groq / GitHub Models)

```
User speaks → Browser STT → text → WebSocket →
→ LLM (streaming) → sentence chunks → Edge-TTS (per sentence) →
→ MP3 audio → WebSocket → Browser playback (starts in ~500ms)
```

The LLM response streams token-by-token. As each sentence completes, it's immediately sent to Edge-TTS for synthesis. Audio playback begins while remaining sentences are still generating — eliminating the "batch-and-wait" feel of traditional pipelines.

### Realtime Mode (OpenAI / ElevenLabs)

```
User speaks → PCM16 audio → WebSocket →
→ Provider (STT + LLM + TTS) →
→ PCM16/audio → WebSocket → Browser playback
```

## Features

| Category | Feature | Details |
|----------|---------|---------|
| **LLM** | 4 providers | Groq (Llama 3.3, free), GitHub Models (GPT-4o, free), OpenAI Realtime, ElevenLabs |
| **Streaming** | Sentence-chunked TTS | Audio starts in ~500ms, not 2-3s |
| **Conversation** | Barge-in | Interrupt the agent by speaking or typing |
| **Conversation** | Turn detection | Server VAD (realtime) or client-side (pipeline) |
| **Tools** | Function calling | Weather, calculator, datetime, knowledge lookup |
| **Audio** | Dual format | MP3 streaming (pipeline) or PCM16 raw (realtime) |
| **Audio** | 6+ voices | Edge-TTS voices including US, UK, South African English |
| **UI** | Live visualization | Real-time audio waveform canvas |
| **UI** | Thinking indicator | Visual feedback during LLM inference |
| **Security** | OWASP headers | X-Content-Type-Options, X-Frame-Options, CSP |
| **Security** | Correlation IDs | Distributed tracing across requests |
| **Ops** | Health probes | `/api/health` (liveness) and `/api/ready` (readiness) |
| **Ops** | Docker | Multi-stage build, non-root user, healthcheck |

## Built-in Tools

| Tool | Description | API |
|------|-------------|-----|
| `get_weather` | Real-time weather for any city | Open-Meteo (free, no key) |
| `calculate` | Safe math evaluation (trig, log, etc.) | Built-in |
| `get_datetime` | Current UTC date and time | Built-in |
| `lookup_knowledge` | Knowledge base search | Extensible to vector DB |

## Quick Start

### Prerequisites

- Python 3.10+
- A free [Groq API key](https://console.groq.com/keys) (recommended)
- _or_ a [GitHub PAT](https://github.com/settings/tokens) with `models:read` scope

> **No paid API keys needed.** Groq provides free access to Llama 3.3 70B and Edge-TTS handles speech synthesis for free.

### Installation

```bash
# Clone the repository
git clone https://github.com/Mtuthuko/Voice-Agent.git
cd Voice-Agent

# Create virtual environment
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env → set GROQ_API_KEY=gsk_your-key-here
```

### Get a Groq API Key (Free)

1. Go to [console.groq.com/keys](https://console.groq.com/keys)
2. Create a free account and generate an API key
3. Copy the key into your `.env` file as `GROQ_API_KEY`

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
docker compose up --build
```

## Usage

1. **Connect** — Click "Connect" to establish a WebSocket session
2. **Speak** — Click the mic button. Your browser transcribes speech in real-time
3. **Listen** — Atlas responds with natural streaming speech. Watch the waveform visualizer react
4. **Interrupt** — Start talking while Atlas speaks to barge in and redirect the conversation
5. **Tools** — Ask "What's the weather in Cape Town?" or "What's the square root of 144?"
6. **Type** — Use the text input as a fallback when voice isn't available

### Voice Options (Edge-TTS)

| Voice | Accent |
|-------|--------|
| `en-US-AndrewMultilingualNeural` | American English (default) |
| `en-US-AvaMultilingualNeural` | American English |
| `en-US-BrianMultilingualNeural` | American English |
| `en-US-EmmaMultilingualNeural` | American English |
| `en-GB-SoniaNeural` | British English |
| `en-ZA-LeahNeural` | South African English |

## Project Structure

```
Voice-Agent/
├── app/
│   ├── api/routes.py              # HTTP + WebSocket endpoints
│   ├── core/
│   │   ├── config.py              # Pydantic settings (env vars)
│   │   ├── logging.py             # Structured logging + correlation IDs
│   │   └── middleware.py          # Security headers, request tracing
│   ├── models/schemas.py          # Pydantic data models
│   ├── providers/
│   │   ├── base.py                # Abstract provider interface
│   │   ├── factory.py             # Provider factory
│   │   ├── groq_provider.py       # Groq: Llama 3.3 + streaming + Edge-TTS
│   │   ├── github_models.py       # GitHub Models: GPT-4o + Edge-TTS
│   │   ├── openai_realtime.py     # OpenAI Realtime API (WebSocket S2S)
│   │   └── elevenlabs_provider.py # ElevenLabs Conversational AI
│   ├── services/
│   │   └── session_manager.py     # Session lifecycle + tool execution
│   └── tools/
│       ├── registry.py            # Decorator-based tool registry
│       └── built_in.py            # Weather, calculator, datetime, knowledge
├── frontend/
│   ├── static/
│   │   ├── css/styles.css         # Dark theme UI
│   │   └── js/
│   │       ├── app.js             # Main controller + barge-in logic
│   │       ├── audio-processor.js # Mic capture + PCM16 conversion
│   │       └── visualizer.js      # Real-time audio waveform
│   └── templates/index.html       # Web interface
├── tests/
│   ├── test_api.py                # 12 API + integration tests
│   └── test_tools.py              # 10 tool system tests
├── Dockerfile                     # Multi-stage build, non-root user
├── docker-compose.yml
├── pyproject.toml                 # Project metadata + tool config
├── requirements.txt
└── CONTRIBUTING.md                # Developer guide
```

## Adding Custom Tools

```python
from app.tools.registry import registry

@registry.register(
    name="search_docs",
    description="Search the documentation by query",
    parameters={
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "Search query"},
            "limit": {"type": "integer", "description": "Max results"},
        },
        "required": ["query"],
    },
)
async def search_docs(query: str, limit: int = 5) -> str:
    results = await db.search(query, limit=limit)
    return json.dumps({"results": results})
```

Tools auto-register and generate OpenAI-compatible function calling schemas. All providers that support function calling will use them automatically.

## Configuration

All settings via environment variables (see `.env.example`):

| Variable | Default | Description |
|----------|---------|-------------|
| `VOICE_PROVIDER` | `groq` | `groq`, `github`, `openai`, or `elevenlabs` |
| `GROQ_API_KEY` | - | Free Groq API key |
| `GROQ_MODEL` | `llama-3.3-70b-versatile` | Open-source model on Groq |
| `GITHUB_TOKEN` | - | GitHub PAT with `models:read` |
| `OPENAI_API_KEY` | - | OpenAI API key (realtime mode) |
| `ELEVENLABS_API_KEY` | - | ElevenLabs API key |
| `AGENT_NAME` | `Atlas` | Agent display name |
| `APP_ENV` | `development` | `development`, `staging`, `production` |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warning`, `error` |
| `ALLOWED_ORIGINS` | `*` | CORS origins (comma-separated) |

### Available Groq Models

| Model | Speed | Quality | Use Case |
|-------|-------|---------|----------|
| `llama-3.3-70b-versatile` | Fast | Best | Default, general purpose |
| `llama-3.1-8b-instant` | Ultra-fast | Good | Low-latency responses |
| `deepseek-r1-distill-llama-70b` | Fast | Best | Complex reasoning |
| `mixtral-8x7b-32768` | Fast | Great | Long context |
| `gemma2-9b-it` | Ultra-fast | Good | Lightweight |

## Testing

```bash
# Run all tests
pytest

# With verbose output
pytest -v

# With coverage
pytest --cov=app --cov-report=term-missing
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Backend** | Python 3.11, FastAPI, WebSockets, Pydantic v2 |
| **LLM** | Groq (Llama 3.3 70B), GitHub Models (GPT-4o), OpenAI Realtime |
| **TTS** | Edge-TTS (free, 30+ voices), OpenAI TTS, ElevenLabs |
| **STT** | Web Speech API (browser-native, free) |
| **Audio** | PCM16/MP3 streaming, Web Audio API, AudioContext |
| **Frontend** | Vanilla JS, Canvas API (waveform visualization) |
| **Security** | OWASP headers, correlation IDs, input validation |
| **Infrastructure** | Docker (multi-stage), Docker Compose, uvicorn |

## License

MIT License - see [LICENSE](LICENSE) for details.

## Author

**Mtuthuko Mngomezulu** — Full-Stack Generative AI Engineer

- GitHub: [@Mtuthuko](https://github.com/Mtuthuko)
- Email: mngomezuluntuthuko@gmail.com

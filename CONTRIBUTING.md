# Contributing

## Prerequisites

- Python 3.11+
- A free [Groq API key](https://console.groq.com/keys) (recommended — runs open-source Llama 3.3 70B)
- _or_ a [GitHub personal access token](https://github.com/settings/tokens) with `models:read` scope (for the GitHub Models provider)

## Setup

```bash
# Clone and enter the project
git clone https://github.com/<your-username>/Voice-Agent.git
cd Voice-Agent

# Create a virtual environment
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Copy environment template and add your token
cp .env.example .env
# Edit .env and set GROQ_API_KEY=gsk_... (or GITHUB_TOKEN=ghp_...)
```

## Running Locally

```bash
uvicorn app.main:app --reload --port 8000
```

Open [http://localhost:8000](http://localhost:8000) in your browser.

## Running Tests

```bash
python -m pytest tests/ -v
```

## Project Structure

```
app/
  api/routes.py          # HTTP + WebSocket endpoints
  core/
    config.py            # Pydantic settings (env vars)
    logging.py           # Structured logging with correlation IDs
    middleware.py         # Security headers, request tracing
  models/schemas.py      # Pydantic data models
  providers/
    base.py              # Abstract provider interface
    factory.py           # Provider factory
    groq_provider.py     # Free pipeline: Groq (Llama 3.3) + Edge-TTS
    github_models.py     # Free pipeline: GitHub Models + Edge-TTS
    openai_realtime.py   # OpenAI Realtime API (WebSocket)
    elevenlabs_provider.py  # ElevenLabs Conversational AI
  services/
    session_manager.py   # Session lifecycle orchestration
  tools/
    registry.py          # Decorator-based tool registry
    built_in.py          # Weather, calculator, datetime, knowledge
frontend/
  templates/index.html   # Main UI
  static/js/             # Client-side audio handling
tests/                   # pytest test suite
```

## Adding a New Tool

```python
from app.tools.registry import registry

@registry.register(
    name="my_tool",
    description="Does something useful",
    parameters={
        "type": "object",
        "properties": {
            "input": {"type": "string", "description": "The input value"},
        },
        "required": ["input"],
    },
)
async def my_tool(input: str) -> str:
    return json.dumps({"result": input.upper()})
```

The tool is automatically available to all providers that support function calling.

## Adding a New Provider

1. Create a new file in `app/providers/` that subclasses `VoiceProviderBase`.
2. Implement all abstract methods: `connect`, `disconnect`, `send_audio`, `receive_events`, `send_tool_result`, `interrupt`, `get_conversation_state`.
3. Register it in `app/providers/factory.py` and add the enum value to `VoiceProvider` in `app/core/config.py`.

## Code Standards

- Type annotations on all public functions
- Module-level docstrings on every file
- `ruff` for linting, `mypy` for type checking (see `pyproject.toml`)
- Security headers via middleware (OWASP best practices)
- Correlation IDs for request tracing

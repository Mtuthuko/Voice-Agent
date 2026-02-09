from __future__ import annotations

import json
import math
from datetime import datetime, timezone

import httpx

from app.tools.registry import registry


@registry.register(
    name="get_weather",
    description="Get the current weather for a given location. Returns temperature, conditions, and humidity.",
    parameters={
        "type": "object",
        "properties": {
            "location": {
                "type": "string",
                "description": "City name or location, e.g. 'London' or 'New York, NY'",
            },
        },
        "required": ["location"],
    },
)
async def get_weather(location: str) -> str:
    """Fetch weather using Open-Meteo (free, no API key required)."""
    async with httpx.AsyncClient(timeout=10) as client:
        # Geocode the location
        geo_resp = await client.get(
            "https://geocoding-api.open-meteo.com/v1/search",
            params={"name": location, "count": 1, "language": "en"},
        )
        geo_data = geo_resp.json()

        if not geo_data.get("results"):
            return json.dumps({"error": f"Location '{location}' not found"})

        place = geo_data["results"][0]
        lat, lon = place["latitude"], place["longitude"]
        place_name = place.get("name", location)
        country = place.get("country", "")

        # Fetch weather
        weather_resp = await client.get(
            "https://api.open-meteo.com/v1/forecast",
            params={
                "latitude": lat,
                "longitude": lon,
                "current": "temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m",
                "temperature_unit": "celsius",
            },
        )
        weather = weather_resp.json()["current"]

        weather_codes = {
            0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
            45: "Foggy", 48: "Rime fog", 51: "Light drizzle", 53: "Moderate drizzle",
            55: "Dense drizzle", 61: "Slight rain", 63: "Moderate rain", 65: "Heavy rain",
            71: "Slight snow", 73: "Moderate snow", 75: "Heavy snow",
            80: "Slight rain showers", 81: "Moderate rain showers", 82: "Violent rain showers",
            95: "Thunderstorm", 96: "Thunderstorm with slight hail",
            99: "Thunderstorm with heavy hail",
        }

        return json.dumps({
            "location": f"{place_name}, {country}",
            "temperature_celsius": weather["temperature_2m"],
            "temperature_fahrenheit": round(weather["temperature_2m"] * 9 / 5 + 32, 1),
            "humidity_percent": weather["relative_humidity_2m"],
            "conditions": weather_codes.get(weather["weather_code"], "Unknown"),
            "wind_speed_kmh": weather["wind_speed_10m"],
        })


@registry.register(
    name="calculate",
    description="Perform a mathematical calculation. Supports basic arithmetic and common math functions.",
    parameters={
        "type": "object",
        "properties": {
            "expression": {
                "type": "string",
                "description": "Mathematical expression to evaluate, e.g. '2 + 2' or 'sqrt(144)'",
            },
        },
        "required": ["expression"],
    },
)
async def calculate(expression: str) -> str:
    """Safely evaluate mathematical expressions."""
    allowed_names = {
        "abs": abs, "round": round, "min": min, "max": max,
        "sqrt": math.sqrt, "pow": math.pow, "log": math.log,
        "log10": math.log10, "sin": math.sin, "cos": math.cos,
        "tan": math.tan, "pi": math.pi, "e": math.e,
        "ceil": math.ceil, "floor": math.floor,
    }
    try:
        result = eval(expression, {"__builtins__": {}}, allowed_names)  # noqa: S307
        return json.dumps({"expression": expression, "result": result})
    except Exception as e:
        return json.dumps({"error": f"Cannot evaluate '{expression}': {str(e)}"})


@registry.register(
    name="get_datetime",
    description="Get the current date and time in UTC.",
    parameters={
        "type": "object",
        "properties": {},
    },
)
async def get_datetime() -> str:
    now = datetime.now(timezone.utc)
    return json.dumps({
        "datetime": now.isoformat(),
        "date": now.strftime("%A, %B %d, %Y"),
        "time": now.strftime("%I:%M %p UTC"),
    })


@registry.register(
    name="lookup_knowledge",
    description="Search a knowledge base for information on a topic. Use this for factual questions.",
    parameters={
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "The search query or topic to look up",
            },
        },
        "required": ["query"],
    },
)
async def lookup_knowledge(query: str) -> str:
    """Simulated knowledge base lookup. In production, this would connect to a vector DB."""
    knowledge_base = {
        "voice agent": (
            "A voice agent is an AI-powered system that can engage in spoken conversations "
            "with users. It typically combines speech-to-text (STT), a language model (LLM), "
            "and text-to-speech (TTS) to create a natural conversational experience."
        ),
        "openai realtime api": (
            "OpenAI's Realtime API enables low-latency, multi-modal conversational experiences "
            "with support for natural speech input and output. It handles voice activity detection, "
            "transcription, and response generation in a single WebSocket connection."
        ),
        "elevenlabs": (
            "ElevenLabs is an AI audio platform offering high-quality text-to-speech, "
            "voice cloning, and conversational AI capabilities. Their API supports "
            "real-time streaming for low-latency voice interactions."
        ),
    }

    query_lower = query.lower()
    results = []
    for key, value in knowledge_base.items():
        if any(word in query_lower for word in key.split()):
            results.append({"topic": key, "content": value})

    if results:
        return json.dumps({"results": results, "count": len(results)})
    return json.dumps({
        "results": [],
        "count": 0,
        "note": f"No results found for '{query}'. In production, this would search a vector database.",
    })

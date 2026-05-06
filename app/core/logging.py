"""Structured logging with correlation ID support for request tracing.

In production, emits JSON logs for easy ingestion by log aggregators.
In development, uses human-readable format with timestamps.
"""

from __future__ import annotations

import logging
import sys
import uuid
from contextvars import ContextVar

from app.core.config import settings

correlation_id: ContextVar[str] = ContextVar("correlation_id", default="")


def get_correlation_id() -> str:
    """Return the current correlation ID, generating one if not set."""
    cid = correlation_id.get()
    if not cid:
        cid = uuid.uuid4().hex[:12]
        correlation_id.set(cid)
    return cid


class CorrelationFilter(logging.Filter):
    """Inject the current correlation ID into every log record."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.correlation_id = get_correlation_id()  # type: ignore[attr-defined]
        return True


def setup_logging() -> logging.Logger:
    log_level = getattr(logging, settings.log_level.upper(), logging.INFO)

    if settings.is_production:
        fmt = (
            '{"time":"%(asctime)s","level":"%(levelname)s","logger":"%(name)s",'
            '"correlation_id":"%(correlation_id)s","message":"%(message)s"}'
        )
    else:
        fmt = "%(asctime)s | %(levelname)-8s | %(correlation_id)s | %(name)s | %(message)s"

    formatter = logging.Formatter(fmt=fmt, datefmt="%Y-%m-%d %H:%M:%S")

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)
    handler.addFilter(CorrelationFilter())

    app_logger = logging.getLogger("voice_agent")
    app_logger.setLevel(log_level)
    app_logger.addHandler(handler)

    # Suppress noisy third-party loggers
    for name in ("httpx", "httpcore", "websockets", "openai"):
        logging.getLogger(name).setLevel(logging.WARNING)

    return app_logger


logger = setup_logging()

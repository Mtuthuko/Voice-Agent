from __future__ import annotations

import logging
import sys

from app.core.config import settings


def setup_logging() -> logging.Logger:
    log_level = getattr(logging, settings.log_level.upper(), logging.INFO)

    formatter = logging.Formatter(
        fmt="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)

    logger = logging.getLogger("voice_agent")
    logger.setLevel(log_level)
    logger.addHandler(handler)

    return logger


logger = setup_logging()

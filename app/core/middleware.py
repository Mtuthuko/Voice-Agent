"""Custom middleware for security headers and request tracing."""

from __future__ import annotations

import time

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

from app.core.logging import correlation_id, get_correlation_id, logger


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add OWASP-recommended security headers to all HTTP responses."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "microphone=(self)"
        return response


class RequestTracingMiddleware(BaseHTTPMiddleware):
    """Attach a correlation ID to each request for distributed tracing."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        cid = request.headers.get("X-Correlation-ID", "")
        if cid:
            correlation_id.set(cid)
        else:
            cid = get_correlation_id()

        start = time.perf_counter()
        response = await call_next(request)
        duration_ms = (time.perf_counter() - start) * 1000

        response.headers["X-Correlation-ID"] = cid

        path = request.url.path
        if not path.startswith("/static") and path != "/api/health":
            logger.info(
                f"{request.method} {path} -> {response.status_code} ({duration_ms:.1f}ms)"
            )

        return response

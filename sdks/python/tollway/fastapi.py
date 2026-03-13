"""
FastAPI / Starlette middleware for the Tollway protocol.

Drop-in equivalent of :class:`~tollway.middleware.TollwayMiddleware` for
FastAPI applications, implemented as a Starlette ASGI middleware.
"""

from __future__ import annotations

import json
import secrets
import time
from collections.abc import Callable
from datetime import datetime, timezone
from typing import Any

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.types import ASGIApp

from .identity import AgentIdentity, parse_agent_identity, verify_signature
from .middleware import (
    _NONCE_WINDOW_SECONDS,
    _is_nonce_used,
    _price_for_scope,
    _record_nonce,
    _server_policy_to_dict,
)
from .policy import ServerPolicy, build_tollway_json


class TollwayFastAPI(BaseHTTPMiddleware):
    """
    Starlette/FastAPI middleware implementing the Tollway server protocol.

    Usage::

        from fastapi import FastAPI
        from tollway import TollwayFastAPI

        app = FastAPI()
        app.add_middleware(
            TollwayFastAPI,
            policy={
                "allowed_actions": ["read", "search"],
                "prohibited_actions": ["scrape_bulk"],
                "payment_required_actions": ["summarize"],
                "pricing_schedule": [{"action": "summarize", "price": "0.005"}],
                "payment_address": "0xYourWalletAddress",
            },
        )

    Parameters
    ----------
    app:
        The ASGI application to wrap.
    policy:
        Site policy dict or :class:`~tollway.policy.ServerPolicy`.
    payment_address:
        USDC wallet address.  Overrides ``policy["payment_address"]`` when
        provided as a top-level keyword.
    payment_network:
        Blockchain network for payments (default ``"base"``).
    on_agent_request:
        Optional callback called with ``(identity, request)`` after the
        request passes all validation checks.
    enable_logging:
        Print a JSON log line for each agent request (default ``True``).
    """

    def __init__(
        self,
        app: ASGIApp,
        *,
        policy: dict[str, Any] | ServerPolicy,
        payment_address: str | None = None,
        payment_network: str = "base",
        on_agent_request: Callable[[AgentIdentity, Request], None] | None = None,
        enable_logging: bool = True,
    ) -> None:
        super().__init__(app)

        if isinstance(policy, ServerPolicy):
            self._policy = _server_policy_to_dict(policy)
        else:
            self._policy = dict(policy)

        self._payment_address: str | None = (
            payment_address or self._policy.get("payment_address")
        )
        self._payment_network = payment_network
        self._on_agent_request = on_agent_request
        self._enable_logging = enable_logging

        if self._payment_address:
            self._policy.setdefault("payment_address", self._payment_address)
        self._tollway_json: str = build_tollway_json(self._policy)

    async def dispatch(self, request: Request, call_next: Any) -> Response:
        # Serve policy file
        if request.url.path == "/.well-known/tollway.json":
            return Response(
                content=self._tollway_json,
                status_code=200,
                media_type="application/json",
            )

        # Only process requests that carry Tollway headers
        headers = dict(request.headers)
        identity = parse_agent_identity(headers)
        if identity is None:
            return await call_next(request)

        # --- Timestamp validation ---
        try:
            req_dt = datetime.fromisoformat(
                identity.timestamp.replace("Z", "+00:00")
            )
            age = abs(datetime.now(timezone.utc).timestamp() - req_dt.timestamp())
        except ValueError:
            age = float("inf")

        if age > _NONCE_WINDOW_SECONDS:
            return _json_error(
                400,
                "tollway_timestamp_invalid",
                "Request timestamp is outside the 5-minute window.",
            )

        # --- Nonce replay protection ---
        if _is_nonce_used(identity.nonce):
            return _json_error(
                400,
                "tollway_replay_attack",
                "Nonce has already been used.",
            )
        _record_nonce(identity.nonce)

        # --- Prohibited actions ---
        prohibited: list[str] = self._policy.get("prohibited_actions", [])
        if identity.scope in prohibited:
            return _json_error(
                403,
                "tollway_action_prohibited",
                f'Action "{identity.scope}" is not permitted on this site.',
            )

        # --- Signature verification ---
        url = str(request.url)
        identity.verified = verify_signature(identity, request.method, url)

        # --- Payment enforcement ---
        payment_required: list[str] = self._policy.get("payment_required_actions", [])
        payment_proof = request.headers.get("X-Tollway-Payment")

        if identity.scope in payment_required and not payment_proof:
            if self._payment_address:
                price = _price_for_scope(identity.scope, self._policy)
                if price is not None:
                    return self._payment_required_response(identity, price, request)

        # --- Logging ---
        if self._enable_logging:
            print(
                "[tollway]",
                json.dumps(
                    {
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                        "did": identity.did,
                        "purpose": identity.purpose,
                        "scope": identity.scope,
                        "url": str(request.url),
                        "method": request.method,
                        "verified": identity.verified,
                        "paid": bool(payment_proof),
                        "framework": identity.framework,
                    }
                ),
            )

        # --- Callback ---
        if self._on_agent_request:
            self._on_agent_request(identity, request)

        # Attach identity to request state for route handlers
        request.state.tollway_identity = identity

        response = await call_next(request)
        response.headers["X-Tollway-Served"] = "1"
        response.headers["X-Tollway-Version"] = "0.1"
        return response

    def _payment_required_response(
        self,
        identity: AgentIdentity,
        price: str,
        request: Request,
    ) -> JSONResponse:
        payment_id = f"pay_{secrets.token_hex(8)}"
        expires_at = datetime.fromtimestamp(
            time.time() + _NONCE_WINDOW_SECONDS, tz=timezone.utc
        ).strftime("%Y-%m-%dT%H:%M:%SZ")

        return JSONResponse(
            status_code=402,
            content={
                "tollway_version": "0.1",
                "price": price,
                "currency": "USDC",
                "network": self._payment_network,
                "payment_address": self._payment_address,
                "payment_id": payment_id,
                "expires_at": expires_at,
                "memo": f"{identity.scope} access: {request.url.path}",
            },
        )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _json_error(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        content={"error": code, "message": message},
    )

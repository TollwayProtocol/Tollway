"""
Flask middleware for the Tollway protocol.

Serves ``/.well-known/tollway.json``, validates agent identity headers when
present, enforces prohibited actions and payment requirements, and calls an
optional callback for every verified agent request.
"""

from __future__ import annotations

import os
import secrets
import time
from collections.abc import Callable
from datetime import datetime, timezone
from typing import Any

from flask import Flask, Response, jsonify, request

from .identity import AgentIdentity, parse_agent_identity, verify_signature
from .policy import ServerPolicy, build_tollway_json

# ---------------------------------------------------------------------------
# Shared nonce store (in-process, single-worker)
# ---------------------------------------------------------------------------
_NONCE_STORE: dict[str, float] = {}   # nonce -> unix timestamp of first seen
_NONCE_WINDOW_SECONDS = 300           # 5 minutes


def _is_nonce_used(nonce: str) -> bool:
    ts = _NONCE_STORE.get(nonce)
    if ts is None:
        return False
    if time.time() - ts > _NONCE_WINDOW_SECONDS:
        del _NONCE_STORE[nonce]
        return False
    return True


def _record_nonce(nonce: str) -> None:
    _NONCE_STORE[nonce] = time.time()
    # Prune stale entries when the store grows large
    if len(_NONCE_STORE) > 10_000:
        cutoff = time.time() - _NONCE_WINDOW_SECONDS
        stale = [k for k, v in _NONCE_STORE.items() if v < cutoff]
        for k in stale:
            del _NONCE_STORE[k]


# ---------------------------------------------------------------------------
# TollwayMiddleware
# ---------------------------------------------------------------------------

class TollwayMiddleware:
    """
    Flask middleware that implements the Tollway server protocol.

    Usage::

        from tollway import TollwayMiddleware

        app = Flask(__name__)
        TollwayMiddleware(
            app,
            policy={
                "allowed_actions": ["read", "search"],
                "prohibited_actions": ["scrape_bulk"],
                "payment_required_actions": ["summarize"],
                "pricing_schedule": [{"action": "summarize", "price": "0.005"}],
                "payment_address": "0xYourWalletAddress",
            },
        )

    The *policy* argument may be a plain ``dict`` (same schema as
    :func:`~tollway.policy.build_tollway_json`) or a
    :class:`~tollway.policy.ServerPolicy` instance.

    Parameters
    ----------
    app:
        Flask application to attach to.
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
        app: Flask,
        *,
        policy: dict[str, Any] | ServerPolicy,
        payment_address: str | None = None,
        payment_network: str = "base",
        on_agent_request: Callable[[AgentIdentity, Any], None] | None = None,
        enable_logging: bool = True,
    ) -> None:
        # Normalise policy to a dict
        if isinstance(policy, ServerPolicy):
            self._policy = _server_policy_to_dict(policy)
        else:
            self._policy = dict(policy)

        # Top-level keyword overrides dict key
        self._payment_address: str | None = (
            payment_address or self._policy.get("payment_address")
        )
        self._payment_network = payment_network
        self._on_agent_request = on_agent_request
        self._enable_logging = enable_logging

        # Pre-build tollway.json payload (string, served verbatim)
        if self._payment_address:
            self._policy.setdefault("payment_address", self._payment_address)
        self._tollway_json: str = build_tollway_json(self._policy)

        app.before_request(self._before_request)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _before_request(self) -> Response | None:
        """Flask before_request hook — return a Response to short-circuit."""

        # Serve policy file
        if request.path == "/.well-known/tollway.json":
            return Response(
                self._tollway_json,
                status=200,
                mimetype="application/json",
            )

        # Only process requests that carry Tollway headers
        identity = parse_agent_identity(dict(request.headers))
        if identity is None:
            return None  # pass through

        # --- Timestamp validation ---
        try:
            req_dt = datetime.fromisoformat(
                identity.timestamp.replace("Z", "+00:00")
            )
            age = abs(
                datetime.now(timezone.utc).timestamp() - req_dt.timestamp()
            )
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
        url = request.url
        identity.verified = verify_signature(identity, request.method, url)

        # --- Payment enforcement ---
        payment_required: list[str] = self._policy.get("payment_required_actions", [])
        payment_proof = request.headers.get("X-Tollway-Payment")

        if identity.scope in payment_required and not payment_proof:
            if self._payment_address:
                price = _price_for_scope(identity.scope, self._policy)
                if price is not None:
                    return self._payment_required_response(identity, price)

        # --- Logging ---
        if self._enable_logging:
            import json as _json

            print(
                "[tollway]",
                _json.dumps(
                    {
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                        "did": identity.did,
                        "purpose": identity.purpose,
                        "scope": identity.scope,
                        "url": request.url,
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

        # Expose identity to the route handler via Flask's g / request
        request.environ["tollway_identity"] = identity

        return None  # continue to route handler

    def _payment_required_response(
        self, identity: AgentIdentity, price: str
    ) -> Response:
        payment_id = f"pay_{secrets.token_hex(8)}"
        expires_at = datetime.fromtimestamp(
            time.time() + _NONCE_WINDOW_SECONDS, tz=timezone.utc
        ).strftime("%Y-%m-%dT%H:%M:%SZ")

        body = {
            "tollway_version": "0.1",
            "price": price,
            "currency": "USDC",
            "network": self._payment_network,
            "payment_address": self._payment_address,
            "payment_id": payment_id,
            "expires_at": expires_at,
            "memo": f"{identity.scope} access: {request.path}",
        }
        resp = jsonify(body)
        resp.status_code = 402
        return resp


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _json_error(status: int, code: str, message: str) -> Response:
    resp = jsonify({"error": code, "message": message})
    resp.status_code = status
    return resp


def _price_for_scope(scope: str, policy: dict[str, Any]) -> str | None:
    for entry in policy.get("pricing_schedule", []):
        if isinstance(entry, dict) and entry.get("action") == scope:
            return entry.get("price")
        if hasattr(entry, "action") and entry.action == scope:
            return entry.price
    return None


def _server_policy_to_dict(policy: ServerPolicy) -> dict[str, Any]:
    return {
        "require_did": policy.require_did,
        "minimum_reputation": policy.minimum_reputation,
        "allowed_principals": policy.allowed_principals,
        "blocked_principals": policy.blocked_principals,
        "currency": policy.currency,
        "free_requests_per_day": policy.free_requests_per_day,
        "pricing_schedule": policy.pricing_schedule,
        "cache_allowed": policy.cache_allowed,
        "cache_ttl_seconds": policy.cache_ttl_seconds,
        "training_allowed": policy.training_allowed,
        "training_requires_payment": policy.training_requires_payment,
        "attribution_required": policy.attribution_required,
        "attribution_format": policy.attribution_format,
        "requests_per_minute": policy.requests_per_minute,
        "requests_per_day": policy.requests_per_day,
        "burst_allowance": policy.burst_allowance,
        "allowed_actions": policy.allowed_actions,
        "prohibited_actions": policy.prohibited_actions,
        "payment_required_actions": policy.payment_required_actions,
    }

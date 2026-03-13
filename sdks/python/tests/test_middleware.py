"""
Flask middleware tests for the Tollway SDK.

Covers:
- /.well-known/tollway.json is served correctly
- Requests without Tollway headers pass through unmodified
- Requests with an expired timestamp are rejected (400)
- Payment-required scopes return HTTP 402 with the correct JSON body
- Prohibited actions return HTTP 403
"""

from __future__ import annotations

import json
import time
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import pytest
from flask import Flask

from tollway import TollwayMiddleware
from tollway.middleware import _NONCE_STORE


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

PAYMENT_ADDRESS = "0xDeadBeefDeadBeefDeadBeefDeadBeefDeadBeef"

BASE_POLICY: dict = {
    "allowed_actions": ["read", "search", "summarize"],
    "prohibited_actions": ["scrape_bulk", "train"],
    "payment_required_actions": ["summarize"],
    "pricing_schedule": [
        {"action": "summarize", "price": "0.005"},
        {"action": "read", "price": "0.001"},
    ],
    "payment_address": PAYMENT_ADDRESS,
    "training_allowed": False,
    "attribution_required": True,
}


@pytest.fixture()
def app() -> Flask:
    """Flask app with Tollway middleware attached."""
    flask_app = Flask(__name__)

    TollwayMiddleware(
        flask_app,
        policy=BASE_POLICY,
        payment_network="base",
        enable_logging=False,
    )

    @flask_app.route("/")
    def index():
        return "hello", 200

    @flask_app.route("/article")
    def article():
        return "content", 200

    return flask_app


@pytest.fixture()
def client(app: Flask):
    return app.test_client()


def _fresh_timestamp(offset_seconds: int = 0) -> str:
    """ISO-8601 UTC timestamp, optionally offset by *offset_seconds*."""
    dt = datetime.now(timezone.utc) + timedelta(seconds=offset_seconds)
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def _tollway_headers(
    scope: str = "read",
    timestamp: str | None = None,
    nonce: str | None = None,
) -> dict[str, str]:
    """Minimal valid Tollway identity headers (no real signature)."""
    import uuid

    return {
        "X-Tollway-Version": "0.1",
        "X-Tollway-DID": "did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK",
        "X-Tollway-Purpose": "research",
        "X-Tollway-Scope": scope,
        "X-Tollway-Nonce": nonce or str(uuid.uuid4()),
        "X-Tollway-Timestamp": timestamp or _fresh_timestamp(),
    }


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestTollwayJsonEndpoint:
    def test_serves_tollway_json(self, client):
        resp = client.get("/.well-known/tollway.json")
        assert resp.status_code == 200
        assert resp.content_type == "application/json"

    def test_tollway_json_has_required_keys(self, client):
        resp = client.get("/.well-known/tollway.json")
        data = json.loads(resp.data)
        assert data["version"] == "0.1"
        assert "data_policy" in data
        assert "actions" in data

    def test_tollway_json_reflects_policy(self, client):
        resp = client.get("/.well-known/tollway.json")
        data = json.loads(resp.data)
        assert "scrape_bulk" in data["actions"]["prohibited"]
        assert "summarize" in data["actions"]["require_payment"]
        assert data["data_policy"]["training_allowed"] is False
        assert data["data_policy"]["attribution_required"] is True

    def test_tollway_json_payment_address(self, client):
        resp = client.get("/.well-known/tollway.json")
        data = json.loads(resp.data)
        assert data["endpoints"]["payment_address"] == PAYMENT_ADDRESS


class TestPassThrough:
    def test_non_agent_request_passes_through(self, client):
        """Requests without Tollway headers should reach the route handler."""
        resp = client.get("/")
        assert resp.status_code == 200
        assert b"hello" in resp.data

    def test_non_agent_request_no_tollway_headers_in_response(self, client):
        resp = client.get("/")
        # Middleware must not inject X-Tollway-Served for non-agent requests
        assert resp.headers.get("X-Tollway-Served") is None


class TestTimestampValidation:
    def test_expired_timestamp_returns_400(self, client):
        old_ts = _fresh_timestamp(offset_seconds=-(6 * 60))  # 6 minutes ago
        headers = _tollway_headers(timestamp=old_ts)
        resp = client.get("/article", headers=headers)
        assert resp.status_code == 400
        body = json.loads(resp.data)
        assert body["error"] == "tollway_timestamp_invalid"

    def test_future_timestamp_too_far_returns_400(self, client):
        future_ts = _fresh_timestamp(offset_seconds=6 * 60)  # 6 minutes ahead
        headers = _tollway_headers(timestamp=future_ts)
        resp = client.get("/article", headers=headers)
        assert resp.status_code == 400
        body = json.loads(resp.data)
        assert body["error"] == "tollway_timestamp_invalid"

    def test_fresh_timestamp_passes(self, client):
        headers = _tollway_headers(scope="read")
        resp = client.get("/article", headers=headers)
        # Should reach the route (200) or hit 402 payment check, but NOT 400
        assert resp.status_code != 400


class TestNonceReplay:
    def test_duplicate_nonce_rejected(self, client):
        import uuid

        nonce = str(uuid.uuid4())
        headers = _tollway_headers(nonce=nonce)

        resp1 = client.get("/article", headers=headers)
        # First request: either 200 or 402 (payment gated), never 400
        assert resp1.status_code != 400

        resp2 = client.get("/article", headers=headers)
        assert resp2.status_code == 400
        body = json.loads(resp2.data)
        assert body["error"] == "tollway_replay_attack"


class TestProhibitedActions:
    def test_prohibited_scope_returns_403(self, client):
        headers = _tollway_headers(scope="scrape_bulk")
        resp = client.get("/article", headers=headers)
        assert resp.status_code == 403
        body = json.loads(resp.data)
        assert body["error"] == "tollway_action_prohibited"
        assert "scrape_bulk" in body["message"]

    def test_another_prohibited_scope_returns_403(self, client):
        headers = _tollway_headers(scope="train")
        resp = client.get("/article", headers=headers)
        assert resp.status_code == 403


class TestPaymentRequired:
    def test_payment_required_scope_returns_402(self, client):
        headers = _tollway_headers(scope="summarize")
        resp = client.get("/article", headers=headers)
        assert resp.status_code == 402

    def test_402_body_structure(self, client):
        headers = _tollway_headers(scope="summarize")
        resp = client.get("/article", headers=headers)
        body = json.loads(resp.data)
        assert body["tollway_version"] == "0.1"
        assert body["currency"] == "USDC"
        assert body["network"] == "base"
        assert body["payment_address"] == PAYMENT_ADDRESS
        assert "payment_id" in body
        assert body["payment_id"].startswith("pay_")
        assert "expires_at" in body
        assert "price" in body
        assert "memo" in body

    def test_402_price_matches_schedule(self, client):
        headers = _tollway_headers(scope="summarize")
        resp = client.get("/article", headers=headers)
        body = json.loads(resp.data)
        assert body["price"] == "0.005"

    def test_payment_proof_bypasses_402(self, client):
        """If X-Tollway-Payment header is present, skip the 402 gate."""
        headers = _tollway_headers(scope="summarize")
        headers["X-Tollway-Payment"] = json.dumps(
            {"tx_hash": "0xabc", "network": "base", "payment_id": "pay_test"}
        )
        resp = client.get("/article", headers=headers)
        # Should reach the route handler (200), not 402
        assert resp.status_code == 200

    def test_non_payment_scope_not_gated(self, client):
        headers = _tollway_headers(scope="read")
        resp = client.get("/article", headers=headers)
        assert resp.status_code == 200


class TestCallbackInvoked:
    def test_on_agent_request_callback_called(self, app: Flask):
        """The on_agent_request callback fires for valid agent requests."""
        calls: list = []

        def on_agent(identity, req):
            calls.append(identity)

        flask_app = Flask(__name__)
        TollwayMiddleware(
            flask_app,
            policy=BASE_POLICY,
            on_agent_request=on_agent,
            enable_logging=False,
        )

        @flask_app.route("/page")
        def page():
            return "ok", 200

        with flask_app.test_client() as c:
            headers = _tollway_headers(scope="read")
            c.get("/page", headers=headers)

        assert len(calls) == 1
        assert calls[0].scope == "read"

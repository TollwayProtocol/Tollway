"""
Tollway policy helpers: the ServerPolicy dataclass and tollway.json builder.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any


@dataclass
class PricingEntry:
    """A single action/price pair for the pricing schedule."""

    action: str
    price: str


@dataclass
class ServerPolicy:
    """
    Declarative server policy used to build ``tollway.json`` and drive
    middleware enforcement.
    """

    # Identity
    require_did: bool = False
    minimum_reputation: float | None = None
    allowed_principals: list[str] = field(default_factory=list)
    blocked_principals: list[str] = field(default_factory=list)

    # Pricing
    currency: str = "USDC"
    free_requests_per_day: int | None = None
    pricing_schedule: list[PricingEntry] = field(default_factory=list)

    # Data policy
    cache_allowed: bool = True
    cache_ttl_seconds: int = 3600
    training_allowed: bool = False
    training_requires_payment: bool = False
    attribution_required: bool = False
    attribution_format: str = "{title} ({url})"

    # Rate limits
    requests_per_minute: int | None = None
    requests_per_day: int | None = None
    burst_allowance: int | None = None

    # Action scopes
    allowed_actions: list[str] = field(
        default_factory=lambda: ["read", "search", "summarize"]
    )
    prohibited_actions: list[str] = field(default_factory=list)
    payment_required_actions: list[str] = field(default_factory=list)


def build_tollway_json(policy_dict: dict[str, Any]) -> str:
    """
    Build a ``tollway.json`` string from a plain policy dictionary.

    The *policy_dict* mirrors the ``tollway.json`` schema directly (snake_case
    keys).  Unknown keys are passed through unchanged so callers can include
    custom fields.

    Example::

        json_str = build_tollway_json({
            "require_did": True,
            "minimum_reputation": 0.5,
            "allowed_actions": ["read", "search"],
            "prohibited_actions": ["scrape_bulk", "train"],
            "payment_required_actions": ["summarize"],
            "pricing_schedule": [
                {"action": "summarize", "price": "0.005"},
            ],
            "payment_address": "0xYourWalletAddress",
        })
    """
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    doc: dict[str, Any] = {
        "$schema": "https://tollway.dev/schema/v0.1/tollway.schema.json",
        "version": "0.1",
        "updated": now,
    }

    # Identity block
    require_did = policy_dict.get("require_did")
    minimum_reputation = policy_dict.get("minimum_reputation")
    allowed_principals = policy_dict.get("allowed_principals", [])
    blocked_principals = policy_dict.get("blocked_principals", [])

    if any(
        v is not None
        for v in [require_did, minimum_reputation, allowed_principals, blocked_principals]
    ):
        identity: dict[str, Any] = {}
        if require_did is not None:
            identity["require_did"] = require_did
        if minimum_reputation is not None:
            identity["minimum_reputation"] = minimum_reputation
        if allowed_principals:
            identity["allowed_principals"] = allowed_principals
        if blocked_principals:
            identity["blocked_principals"] = blocked_principals
        doc["identity"] = identity

    # Pricing block
    free_rpd = policy_dict.get("free_requests_per_day")
    schedule_raw = policy_dict.get("pricing_schedule", [])
    currency = policy_dict.get("currency", "USDC")
    default_per_request = policy_dict.get("default_per_request")

    if free_rpd is not None or schedule_raw or default_per_request is not None:
        pricing: dict[str, Any] = {"currency": currency}
        if default_per_request is not None:
            pricing["default_per_request"] = default_per_request
        if free_rpd is not None:
            pricing["free_requests_per_day"] = free_rpd
        if schedule_raw:
            # Accept both dicts and PricingEntry-like objects
            pricing["schedule"] = [
                (
                    {"action": entry["action"], "price": entry["price"]}
                    if isinstance(entry, dict)
                    else {"action": entry.action, "price": entry.price}
                )
                for entry in schedule_raw
            ]
        doc["pricing"] = pricing

    # Data policy block
    doc["data_policy"] = {
        "cache_allowed": policy_dict.get("cache_allowed", True),
        "cache_ttl_seconds": policy_dict.get("cache_ttl_seconds", 3600),
        "training_allowed": policy_dict.get("training_allowed", False),
        "training_requires_payment": policy_dict.get("training_requires_payment", False),
        "attribution_required": policy_dict.get("attribution_required", False),
        "attribution_format": policy_dict.get("attribution_format", "{title} ({url})"),
    }

    # Rate limits block
    rpm = policy_dict.get("requests_per_minute")
    rpd = policy_dict.get("requests_per_day")
    burst = policy_dict.get("burst_allowance")
    if any(v is not None for v in [rpm, rpd, burst]):
        rate_limits: dict[str, Any] = {}
        if rpm is not None:
            rate_limits["requests_per_minute"] = rpm
        if rpd is not None:
            rate_limits["requests_per_day"] = rpd
        if burst is not None:
            rate_limits["burst_allowance"] = burst
        doc["rate_limits"] = rate_limits

    # Actions block
    allowed_actions = policy_dict.get("allowed_actions", ["read", "search", "summarize"])
    prohibited_actions = policy_dict.get("prohibited_actions", [])
    payment_required_actions = policy_dict.get("payment_required_actions", [])

    doc["actions"] = {
        "allowed": allowed_actions,
        "prohibited": prohibited_actions,
        "require_payment": payment_required_actions,
    }

    # Endpoints block
    payment_address = policy_dict.get("payment_address")
    agent_api = policy_dict.get("agent_api")
    schema_url = policy_dict.get("schema_url")
    if any(v is not None for v in [payment_address, agent_api, schema_url]):
        endpoints: dict[str, Any] = {}
        if agent_api:
            endpoints["agent_api"] = agent_api
        if schema_url:
            endpoints["schema_url"] = schema_url
        if payment_address:
            endpoints["payment_address"] = payment_address
        doc["endpoints"] = endpoints

    # Contact block
    contact_email = policy_dict.get("contact_email")
    abuse_email = policy_dict.get("abuse_email")
    if contact_email or abuse_email:
        contact: dict[str, Any] = {}
        if contact_email:
            contact["email"] = contact_email
        if abuse_email:
            contact["abuse"] = abuse_email
        doc["contact"] = contact

    return json.dumps(doc, indent=2)

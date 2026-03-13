"""
tollway-server — Python SDK for the Tollway protocol.

Quickstart (Flask)::

    from flask import Flask
    from tollway import TollwayMiddleware

    app = Flask(__name__)
    TollwayMiddleware(
        app,
        policy={
            "allowed_actions": ["read", "search", "summarize"],
            "prohibited_actions": ["scrape_bulk"],
            "payment_required_actions": ["summarize"],
            "pricing_schedule": [{"action": "summarize", "price": "0.005"}],
            "payment_address": "0xYourWalletAddress",
        },
    )

Quickstart (FastAPI)::

    from fastapi import FastAPI
    from tollway import TollwayFastAPI

    app = FastAPI()
    app.add_middleware(
        TollwayFastAPI,
        policy={
            "allowed_actions": ["read", "search", "summarize"],
            "prohibited_actions": ["scrape_bulk"],
            "payment_required_actions": ["summarize"],
            "pricing_schedule": [{"action": "summarize", "price": "0.005"}],
            "payment_address": "0xYourWalletAddress",
        },
    )
"""

from .fastapi import TollwayFastAPI
from .identity import AgentIdentity, parse_agent_identity
from .middleware import TollwayMiddleware
from .policy import ServerPolicy, build_tollway_json

__all__ = [
    "TollwayMiddleware",
    "TollwayFastAPI",
    "build_tollway_json",
    "parse_agent_identity",
    "ServerPolicy",
    "AgentIdentity",
]

__version__ = "0.1.0"

# tollway-server (Python)

Python SDK for the [Tollway protocol](https://tollway.dev) — the open standard for AI agent web access.

Provides Flask and FastAPI/Starlette middleware that:

- Serves `/.well-known/tollway.json` automatically
- Validates Tollway identity headers when present (timestamp freshness, nonce replay protection, Ed25519 signature verification)
- Enforces prohibited actions (403)
- Enforces payment-required actions (402 with x402-compatible JSON body)
- Calls an optional `on_agent_request` callback for every verified agent request
- Passes through requests with no Tollway headers unchanged

---

## Installation

```bash
# Flask
pip install "tollway-server[flask]"

# FastAPI
pip install "tollway-server[fastapi]"

# Both
pip install "tollway-server[all]"
```

---

## Quick start — Flask

```python
from flask import Flask
from tollway import TollwayMiddleware

app = Flask(__name__)

TollwayMiddleware(
    app,
    policy={
        "allowed_actions": ["read", "search", "summarize"],
        "prohibited_actions": ["scrape_bulk", "train"],
        "payment_required_actions": ["summarize"],
        "pricing_schedule": [
            {"action": "read",      "price": "0.001"},
            {"action": "search",    "price": "0.002"},
            {"action": "summarize", "price": "0.005"},
        ],
        "payment_address": "0xYourWalletAddress",
        "training_allowed": False,
        "attribution_required": True,
    },
    payment_network="base",
)


@app.route("/article")
def article():
    return "Article content here", 200
```

The identity of the verified agent is attached to the request environment and
can be read from route handlers:

```python
from flask import request

@app.route("/article")
def article():
    identity = request.environ.get("tollway_identity")
    if identity:
        print(f"Agent {identity.did} accessing with scope {identity.scope}")
    return "content", 200
```

---

## Quick start — FastAPI

```python
from fastapi import FastAPI
from tollway import TollwayFastAPI

app = FastAPI()

app.add_middleware(
    TollwayFastAPI,
    policy={
        "allowed_actions": ["read", "search", "summarize"],
        "prohibited_actions": ["scrape_bulk", "train"],
        "payment_required_actions": ["summarize"],
        "pricing_schedule": [
            {"action": "read",      "price": "0.001"},
            {"action": "summarize", "price": "0.005"},
        ],
        "payment_address": "0xYourWalletAddress",
        "training_allowed": False,
        "attribution_required": True,
    },
)


@app.get("/article")
def article(request: Request):
    identity = getattr(request.state, "tollway_identity", None)
    if identity:
        print(f"Agent {identity.did}, scope={identity.scope}, verified={identity.verified}")
    return {"content": "Article text here"}
```

---

## Building tollway.json manually

```python
from tollway import build_tollway_json

json_str = build_tollway_json({
    "require_did": True,
    "minimum_reputation": 0.5,
    "free_requests_per_day": 100,
    "pricing_schedule": [
        {"action": "read",      "price": "0.001"},
        {"action": "search",    "price": "0.002"},
        {"action": "summarize", "price": "0.005"},
        {"action": "train",     "price": "0.05"},
    ],
    "allowed_actions": ["read", "search", "summarize"],
    "prohibited_actions": ["scrape_bulk"],
    "payment_required_actions": ["train", "summarize"],
    "training_allowed": False,
    "attribution_required": True,
    "payment_address": "0xYourWalletAddress",
})

print(json_str)
```

---

## Parsing and verifying agent identity

```python
from tollway import parse_agent_identity
from tollway.identity import verify_signature

identity = parse_agent_identity(dict(request.headers))

if identity:
    ok = verify_signature(identity, method="GET", url="https://example.com/article")
    print(f"DID: {identity.did}, verified: {ok}")
```

---

## Policy options reference

All fields are optional unless marked required.

| Field | Type | Default | Description |
|---|---|---|---|
| `require_did` | bool | `false` | Reject requests without a valid DID |
| `minimum_reputation` | float 0–1 | — | Minimum reputation score (informational; enforcement is your responsibility) |
| `allowed_principals` | list[str] | `[]` | DID allow-list for `X-Tollway-Principal` |
| `blocked_principals` | list[str] | `[]` | DID block-list for `X-Tollway-Principal` |
| `currency` | str | `"USDC"` | Payment currency |
| `free_requests_per_day` | int | — | Free tier before payment required |
| `default_per_request` | str | — | Default price when no schedule entry matches |
| `pricing_schedule` | list[{action, price}] | `[]` | Per-action pricing in USDC |
| `cache_allowed` | bool | `true` | Whether agents may cache responses |
| `cache_ttl_seconds` | int | `3600` | Cache TTL in seconds |
| `training_allowed` | bool | `false` | Whether content may be used for model training |
| `training_requires_payment` | bool | `false` | Whether training requires a payment |
| `attribution_required` | bool | `false` | Whether agents must cite the source |
| `attribution_format` | str | `"{title} ({url})"` | Attribution template |
| `requests_per_minute` | int | — | Rate limit: requests per minute |
| `requests_per_day` | int | — | Rate limit: requests per day |
| `burst_allowance` | int | — | Extra requests allowed in bursts |
| `allowed_actions` | list[str] | `["read","search","summarize"]` | Permitted scopes |
| `prohibited_actions` | list[str] | `[]` | Forbidden scopes → 403 |
| `payment_required_actions` | list[str] | `[]` | Scopes that require payment → 402 |
| `payment_address` | str | — | USDC wallet address for payment |
| `agent_api` | str | — | URL of a dedicated agent API endpoint |
| `schema_url` | str | — | URL of the site's structured data schema |
| `contact_email` | str | — | Contact email |
| `abuse_email` | str | — | Abuse contact email |

---

## Scopes

| Scope | Description |
|---|---|
| `read` | Read / retrieve content |
| `search` | Full-site search |
| `summarize` | Summarize content |
| `train` | Use content for model training |
| `scrape_bulk` | High-volume bulk scraping |

---

## Security notes

- **Timestamp window:** requests more than 5 minutes old (or in the future) are rejected with `400 tollway_timestamp_invalid`.
- **Nonce replay:** each nonce is stored in memory for 5 minutes; duplicates return `400 tollway_replay_attack`.  For multi-process deployments, replace the in-memory store with Redis or a shared database.
- **Signature verification:** Ed25519 signatures are verified using [PyNaCl](https://pynacl.readthedocs.io/).  Only `did:key:z…` DIDs (multicodec `0xed01` prefix) are currently supported.

---

## Running the tests

```bash
pip install -e ".[dev]"
pytest
```

---

## License

MIT — see [LICENSE](../../LICENSE).

Homepage: [https://tollway.dev](https://tollway.dev)

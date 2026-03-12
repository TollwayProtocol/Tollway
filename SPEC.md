# Tollway Protocol Specification v0.1

**Status:** Draft  
**Authors:** Tollway Contributors  
**Repository:** github.com/tollway-protocol/tollway  
**License:** CC BY 4.0

---

## Abstract

Tollway is an open protocol that defines how AI agents identify themselves, request permission, and compensate web publishers when accessing content programmatically. It establishes a standard interface between agents and sites — analogous to what `robots.txt` did for crawlers, but extended with identity, economics, and structured data.

The protocol consists of three components:

1. **`tollway.json`** — a machine-readable policy file at `/.well-known/tollway.json` declaring site access rules, pricing, and data usage policies
2. **Agent Identity Headers** — a standard set of HTTP request headers that agents attach to every request, establishing verifiable identity and intent
3. **Payment Flow** — an extension of HTTP 402 using [x402](https://x402.org) for per-request or subscription micropayments in USDC

---

## 1. Motivation

The web was built for humans. AI agents are increasingly the primary consumers of web content, yet no standard exists for how they should identify themselves, request access, or compensate publishers.

The current dynamic is adversarial:

- Publishers block agents to protect server resources and content value
- Agents scrape without permission, ignoring `robots.txt`, stripping attribution
- No payment flows exist between agents and content producers
- No identity layer lets publishers distinguish legitimate agents from malicious scrapers

**Key data points:**
- AI crawler traffic increased 300% in 2025
- 80%+ of Cloudflare customers now block AI bots
- OpenAI's scrape-to-referral ratio is approximately 1,700:1
- 336% increase in sites actively blocking AI crawlers (Tollbit, Q2 2025)

Tollway makes the relationship cooperative by giving both sides what they need:
- **Publishers** get identity verification, policy control, and revenue
- **Agents** get structured data, reliable access, and a reputational track record

---

## 2. Design Principles

1. **Open by default.** The spec is owned by the community. No single company controls it.
2. **Backwards compatible.** Sites that do nothing are treated as unenrolled, not blocked.
3. **Graduated participation.** Sites can adopt any subset: identity-only, policy-only, or full payment flows.
4. **Decentralized identity.** Agent identity is anchored to DIDs, not centralized registries.
5. **Economics optional.** Payment is supported but not required. Sites may offer free access to verified agents.
6. **Protocol, not platform.** Tollway defines the interface. Implementations are free.

---

## 3. `tollway.json`

### 3.1 Location

Sites MUST serve `tollway.json` at:

```
https://{domain}/.well-known/tollway.json
```

### 3.2 Full Schema

```json
{
  "$schema": "https://tollway.dev/schema/v0.1/tollway.schema.json",
  "version": "0.1",
  "updated": "2026-01-01T00:00:00Z",

  "identity": {
    "require_did": true,
    "minimum_reputation": 0.6,
    "allowed_principals": [],
    "blocked_principals": []
  },

  "pricing": {
    "currency": "USDC",
    "default_per_request": "0.001",
    "free_requests_per_day": 100,
    "schedule": [
      {
        "action": "read",
        "price": "0.001"
      },
      {
        "action": "search",
        "price": "0.002"
      },
      {
        "action": "summarize",
        "price": "0.005"
      },
      {
        "action": "train",
        "price": "0.05"
      }
    ],
    "subscription": {
      "available": true,
      "monthly_usdc": "9.99",
      "contact": "agents@example.com"
    }
  },

  "data_policy": {
    "cache_allowed": true,
    "cache_ttl_seconds": 3600,
    "training_allowed": false,
    "training_requires_payment": true,
    "attribution_required": true,
    "attribution_format": "{title} ({url})"
  },

  "rate_limits": {
    "requests_per_minute": 60,
    "requests_per_day": 10000,
    "burst_allowance": 10
  },

  "actions": {
    "allowed": ["read", "search", "summarize"],
    "prohibited": ["train", "scrape_bulk"],
    "require_payment": ["train", "summarize"]
  },

  "endpoints": {
    "agent_api": "https://example.com/api/agent",
    "schema_url": "https://example.com/api/agent/schema",
    "payment_address": "0xYourWalletAddressHere"
  },

  "contact": {
    "email": "webmaster@example.com",
    "abuse": "abuse@example.com"
  }
}
```

### 3.3 Field Reference

| Field | Type | Required | Description |
|---|---|---|---|
| `version` | string | yes | Spec version. Currently `"0.1"` |
| `updated` | ISO 8601 | yes | Last modification timestamp |
| `identity.require_did` | boolean | no | If true, agent must provide a valid DID |
| `identity.minimum_reputation` | float 0-1 | no | Minimum reputation score required |
| `pricing.currency` | string | no | Payment currency. Default: `"USDC"` |
| `pricing.free_requests_per_day` | int | no | Free tier before payment required |
| `data_policy.cache_allowed` | boolean | no | Whether agent may cache responses |
| `data_policy.training_allowed` | boolean | no | Whether content may be used for model training |
| `data_policy.attribution_required` | boolean | no | Whether agent must cite the source |

---

## 4. Agent Identity Headers

Every compliant agent request MUST include the following HTTP headers.

### 4.1 Required Headers

```http
X-Tollway-DID: did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK
X-Tollway-Principal: did:key:z6MkgmcYMQPfHubW4xBjSkmVF5S2jaGZ9K3gMbEmNqh5o9vK
X-Tollway-Purpose: research
X-Tollway-Scope: read
X-Tollway-Nonce: 7f3d2a1b-4e5c-4f6a-8b9d-0c1e2f3a4b5c
X-Tollway-Timestamp: 2026-01-01T12:00:00Z
X-Tollway-Signature: base64url(ed25519_sign(DID_private_key, canonical_request_string))
```

### 4.2 Optional Headers

```http
X-Tollway-Reputation-Oracle: https://reputation.tollway.dev/v1
X-Tollway-Wallet: 0xYourAgentWalletAddress
X-Tollway-Session: session_abc123
X-Tollway-Framework: langchain/0.3.0
```

### 4.3 Header Definitions

**`X-Tollway-DID`** — The agent's [Decentralized Identifier](https://www.w3.org/TR/did-core/). Used as the primary identity anchor. Must be a valid DID URI.

**`X-Tollway-Principal`** — The DID of the human or organization operating this agent. Enables publishers to distinguish the agent instance from its operator.

**`X-Tollway-Purpose`** — A short, human-readable description of why the agent is accessing this content. Free-form string, max 256 characters. Examples: `research`, `price_comparison`, `news_aggregation`.

**`X-Tollway-Scope`** — The action the agent intends to perform. MUST be one of: `read`, `search`, `summarize`, `train`, `scrape_bulk`. Sites use this to apply the correct pricing tier.

**`X-Tollway-Nonce`** — A UUID v4. Prevents replay attacks. Servers SHOULD store recent nonces and reject duplicates within a 5-minute window.

**`X-Tollway-Timestamp`** — ISO 8601 UTC timestamp of the request. Servers SHOULD reject requests with timestamps more than 5 minutes old.

**`X-Tollway-Signature`** — Ed25519 signature of the canonical request string (see §4.4), base64url-encoded.

### 4.4 Canonical Request String

The signature covers the following string, newline-separated:

```
{X-Tollway-DID}
{X-Tollway-Purpose}
{X-Tollway-Scope}
{X-Tollway-Nonce}
{X-Tollway-Timestamp}
{HTTP_METHOD}
{REQUEST_URL}
```

Example:
```
did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK
research
read
7f3d2a1b-4e5c-4f6a-8b9d-0c1e2f3a4b5c
2026-01-01T12:00:00Z
GET
https://techcrunch.com/2026/01/01/ai-news/
```

---

## 5. Payment Flow

Tollway uses [x402](https://x402.org) — an HTTP 402 extension for USDC micropayments — as its payment rail.

### 5.1 Flow Overview

```
Agent                          Site
  |                              |
  |------ GET /article ---------->|
  |                              |
  |<----- 402 Payment Required --|
  |       X-Payment-Required: {  |
  |         "price": "0.001",    |
  |         "currency": "USDC",  |
  |         "address": "0x...",  |
  |         "network": "base"    |
  |       }                      |
  |                              |
  |  [agent signs + submits tx]  |
  |                              |
  |------ GET /article ---------->|
  |       X-Payment-Proof: {tx}  |
  |                              |
  |<----- 200 OK + content ------|
  |                              |
  |  [site verifies on-chain     |
  |   asynchronously]            |
```

### 5.2 402 Response

```http
HTTP/1.1 402 Payment Required
Content-Type: application/json

{
  "tollway_version": "0.1",
  "price": "0.001",
  "currency": "USDC",
  "network": "base",
  "payment_address": "0xYourWalletAddressHere",
  "payment_id": "pay_abc123",
  "expires_at": "2026-01-01T12:05:00Z",
  "memo": "Read access: /article/ai-news"
}
```

### 5.3 Payment Proof Header

After completing the on-chain transaction, the agent retries with:

```http
X-Tollway-Payment: {
  "tx_hash": "0xabc123...",
  "network": "base",
  "payment_id": "pay_abc123"
}
```

### 5.4 Optimistic Serving

Sites SHOULD serve content optimistically upon receiving a valid `X-Tollway-Payment` header, then verify the transaction on-chain asynchronously. This keeps latency low. Sites MAY block repeat offenders whose payment proofs consistently fail verification.

---

## 6. Reputation Protocol

### 6.1 Overview

Agent reputation is a float between 0.0 and 1.0, publicly queryable from any compliant reputation oracle. There is no central authority — multiple oracles may exist, and sites may choose which to trust.

### 6.2 Score Computation

Oracles SHOULD compute reputation from a weighted combination of:

| Factor | Weight | Description |
|---|---|---|
| Payment reliability | 0.40 | % of payment proofs that verified on-chain |
| Policy compliance | 0.30 | % of requests that respected site `tollway.json` |
| Request integrity | 0.20 | % of requests with valid signatures and fresh timestamps |
| Age | 0.10 | Days since DID first observed (normalized) |

### 6.3 Oracle API

```
GET https://reputation.tollway.dev/v1/{did}

Response:
{
  "did": "did:key:z6Mk...",
  "score": 0.87,
  "observations": 14392,
  "last_seen": "2026-01-01T11:00:00Z",
  "flags": []
}
```

### 6.4 Flag Values

| Flag | Meaning |
|---|---|
| `payment_fraud` | Submitted invalid payment proofs |
| `replay_attack` | Reused nonces |
| `policy_violation` | Repeatedly ignored `tollway.json` restrictions |
| `impersonation` | Used another agent's DID |

---

## 7. The Translator Layer

For sites that have not adopted Tollway, compliant clients SHOULD implement a translator that:

1. Fetches the raw HTML
2. Attempts schema-based structured extraction (CSS selectors from the public schema library)
3. Falls back to LLM-based extraction if no schema exists
4. Returns a normalized JSON object regardless of the site's participation level

This means Tollway clients work on day one, against the entire web, without any site adoption required.

---

## 8. Security Considerations

### 8.1 Replay Attacks
Servers MUST store nonces for a minimum of 5 minutes and reject duplicate nonces within that window.

### 8.2 Timestamp Drift
Servers SHOULD reject requests with `X-Tollway-Timestamp` more than 300 seconds from the server's current time.

### 8.3 Signature Verification
Servers MUST verify `X-Tollway-Signature` using the public key derived from `X-Tollway-DID` before granting elevated access or processing payment.

### 8.4 DID Resolution
Servers MUST resolve DIDs against the DID Universal Resolver or equivalent before accepting identity claims.

### 8.5 Payment Finality
Servers MUST NOT grant permanent access based on an unconfirmed transaction. Optimistic serving is acceptable for low-value content; high-value content SHOULD wait for on-chain confirmation.

---

## 9. Conformance Levels

| Level | Requirements |
|---|---|
| **Level 0 (Aware)** | Serves `tollway.json` with basic policy. No identity or payment required. |
| **Level 1 (Identity)** | Validates agent identity headers and DID signatures. |
| **Level 2 (Gated)** | Enforces identity + reputation minimums before serving. |
| **Level 3 (Full)** | Identity + reputation + payment flows. Full conformance. |

---

## 10. Versioning

The protocol version is declared in `tollway.json` and in the `402` response body. Clients MUST include the version they support in requests via:

```http
X-Tollway-Version: 0.1
```

Servers SHOULD serve appropriate responses for the declared version. Unrecognized versions SHOULD be treated as the latest supported.

---

## Appendix A: Relationship to Existing Standards

| Standard | Relationship |
|---|---|
| `robots.txt` | Tollway is the successor for the agentic era — richer policy, not just allow/deny |
| MCP (Anthropic) | MCP connects agents to tools; Tollway connects agents to the open web |
| A2A (Google) | A2A is agent-to-agent; Tollway is agent-to-site |
| x402 (Coinbase) | Tollway uses x402 as its payment rail |
| Cloudflare Pay Per Crawl | Centralized implementation of similar economics; Tollway is the open standard |
| W3C DID | Tollway uses DIDs for agent identity |

---

## Appendix B: Example `tollway.json` Configurations

### Minimal (policy only, no payment)
```json
{
  "version": "0.1",
  "updated": "2026-01-01T00:00:00Z",
  "data_policy": {
    "training_allowed": false,
    "attribution_required": true
  }
}
```

### News Publisher (paid read access)
```json
{
  "version": "0.1",
  "updated": "2026-01-01T00:00:00Z",
  "identity": { "require_did": true, "minimum_reputation": 0.5 },
  "pricing": {
    "currency": "USDC",
    "free_requests_per_day": 10,
    "schedule": [
      { "action": "read", "price": "0.002" },
      { "action": "summarize", "price": "0.01" },
      { "action": "train", "price": "0.10" }
    ]
  },
  "data_policy": {
    "cache_allowed": true,
    "cache_ttl_seconds": 1800,
    "training_allowed": false,
    "attribution_required": true
  }
}
```

### Developer Docs (free for verified agents)
```json
{
  "version": "0.1",
  "updated": "2026-01-01T00:00:00Z",
  "identity": { "require_did": true, "minimum_reputation": 0.3 },
  "pricing": { "free_requests_per_day": 10000 },
  "data_policy": {
    "cache_allowed": true,
    "training_allowed": true,
    "attribution_required": false
  }
}
```

---

*Tollway is an open standard. Contributions welcome at github.com/tollway-protocol/tollway.*

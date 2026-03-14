# Tollway Protocol Specification

**Version:** 0.1
**Status:** Draft
**License:** CC BY 4.0
**Repository:** https://github.com/TollwayProtocol/Tollway

---

## Abstract

Tollway is an open protocol for structured AI agent access to web content. It defines how agents identify themselves and how sites declare access policies — all over standard HTTP. Payments are an optional extension for sites that want to monetise agent access.

The protocol has three layers, each independently useful:

1. **Identity** — Agents sign every request with an Ed25519 keypair. Sites know who is asking, what for, and can hold agents accountable.
2. **Policy** — Sites publish `tollway.json` declaring what agents can do, rate limits, caching rules, and attribution requirements.
3. **Payments** *(optional)* — HTTP 402 + USDC on Base, for sites that want to charge for premium or bulk access.

---

## Table of Contents

1. [Motivation](#1-motivation)
2. [Versioning](#2-versioning)
3. [Agent Identity](#3-agent-identity)
4. [Request Headers](#4-request-headers)
5. [Request Signing](#5-request-signing)
6. [The Tollway Policy File](#6-the-tollway-policy-file)
7. [HTTP 402 Payment Flow](#7-http-402-payment-flow)
8. [Response Headers](#8-response-headers)
9. [Error Codes](#9-error-codes)
10. [Conformance Levels](#10-conformance-levels)
11. [Security Considerations](#11-security-considerations)
12. [Changelog](#12-changelog)

---

## 1. Motivation

AI agents increasingly browse the web on behalf of users and organizations. Today they do so anonymously — every agent is indistinguishable from a scraper, a competitor's crawler, or a bot conducting a denial-of-service attack. Sites respond the only way they can: blanket blocking, aggressive rate limiting, and CAPTCHAs that degrade everyone.

`robots.txt` was designed for crawlers that respect conventions voluntarily. It has no authentication and no way to distinguish a responsible research agent from a bulk scraper. The result is an adversarial relationship that serves neither side.

Tollway gives agents a cryptographic identity they can stand behind and gives sites a machine-readable policy layer with real enforcement:

- An agent can prove who it is and why it's accessing content — without any prior relationship with the site.
- A site can express nuanced access rules: allowed actions, prohibited actions, rate limits, attribution requirements, caching policy.
- An agent that misbehaves can be blocked by DID and flagged in reputation oracles.
- Attribution requirements are expressed programmatically, not hoped for.
- Sites that want to charge for bulk or premium access can do so via the optional HTTP 402 payment flow.

---

## 2. Versioning

The protocol version is `0.1`. It is communicated in the `X-Tollway-Version` request header and the `version` field of `tollway.json`.

Minor backwards-compatible additions increment the minor version. Breaking changes increment the major version. Servers SHOULD accept requests with any version whose major component matches their own.

---

## 3. Agent Identity

### 3.1 DID Format

Every Tollway agent has a Decentralized Identifier (DID) using the `did:key` method with an Ed25519 public key.

```
did:key:z<base58btc(multicodec_prefix || raw_public_key)>
```

Where:
- `z` is the multibase prefix for base58btc encoding
- `multicodec_prefix` is `0xed 0x01` (Ed25519 public key codec)
- `raw_public_key` is the 32-byte Ed25519 public key

**Example:**
```
did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK
```

### 3.2 Key Generation

Agents MUST generate a fresh Ed25519 keypair. The private key MUST be stored securely and never transmitted. The public key is encoded into the DID as described above.

Using `@tollway/cli`:
```bash
npx @tollway/cli init
```

### 3.3 Principal Identity

An agent MAY declare a `principalDid` — the DID of the operator or organization that controls the agent. This allows sites to apply per-operator policies and enables accountability chains.

---

## 4. Request Headers

All Tollway headers use the `X-Tollway-` prefix. Headers marked **REQUIRED** MUST be present when operating as a Tollway agent. Headers marked **OPTIONAL** MAY be included to provide additional context.

| Header | Required | Description |
|--------|----------|-------------|
| `X-Tollway-Version` | REQUIRED | Protocol version, e.g. `0.1` |
| `X-Tollway-DID` | REQUIRED | Agent's DID, e.g. `did:key:z6Mk...` |
| `X-Tollway-Purpose` | REQUIRED | Human-readable description of why this request is being made |
| `X-Tollway-Scope` | REQUIRED | One of: `read`, `search`, `summarize`, `train`, `scrape_bulk` |
| `X-Tollway-Nonce` | REQUIRED | A UUID v4 unique to this request, used for replay protection |
| `X-Tollway-Timestamp` | REQUIRED | ISO 8601 UTC timestamp, e.g. `2026-03-13T14:00:00.000Z` |
| `X-Tollway-Signature` | REQUIRED | Base64url-encoded Ed25519 signature over the canonical string (§5) |
| `X-Tollway-Principal` | OPTIONAL | DID of the operator or organization controlling this agent |
| `X-Tollway-Wallet` | OPTIONAL | EVM wallet address for payment |
| `X-Tollway-Framework` | OPTIONAL | Agent framework identifier, e.g. `langchain/0.3.0` |
| `X-Tollway-Reputation-Oracle` | OPTIONAL | URL of the reputation oracle the server should query |
| `X-Tollway-Payment` | OPTIONAL | JSON-encoded payment receipt (§7.3); present only on payment retries |

### 4.1 Scope Semantics

| Scope | Meaning |
|-------|---------|
| `read` | Reading or retrieving content for agent use |
| `search` | Querying or searching an index |
| `summarize` | Summarizing content; implies condensed output returned to a user |
| `train` | Using content for model training or fine-tuning |
| `scrape_bulk` | High-volume automated retrieval |

Sites SHOULD charge more for `train` and `scrape_bulk` than for `read`, reflecting the higher commercial value of those operations.

---

## 5. Request Signing

### 5.1 Canonical String

The signature covers a canonical string formed by joining the following fields with newline characters (`\n`):

```
{DID}\n{Purpose}\n{Scope}\n{Nonce}\n{Timestamp}\n{Method}\n{URL}
```

Where:
- `{DID}` is the value of `X-Tollway-DID`
- `{Purpose}` is the value of `X-Tollway-Purpose`
- `{Scope}` is the value of `X-Tollway-Scope`
- `{Nonce}` is the value of `X-Tollway-Nonce`
- `{Timestamp}` is the value of `X-Tollway-Timestamp`
- `{Method}` is the HTTP method in uppercase, e.g. `GET`
- `{URL}` is the full request URL including scheme and query string

**Example canonical string:**
```
did:key:z6MkhaXgBZ...
Research for climate report
read
550e8400-e29b-41d4-a716-446655440000
2026-03-13T14:00:00.000Z
GET
https://example.com/articles/climate-change
```

### 5.2 Signing

The canonical string MUST be signed with the agent's Ed25519 private key. The signature MUST be base64url-encoded (no padding) and placed in `X-Tollway-Signature`.

```
signature = base64url(ed25519_sign(private_key, utf8(canonical_string)))
```

### 5.3 Verification

Servers MUST:
1. Reconstruct the canonical string from the request headers and URL.
2. Decode the DID to extract the raw Ed25519 public key: strip `did:key:z`, base58btc-decode, drop the 2-byte multicodec prefix `0xed 0x01`.
3. Verify the signature using Ed25519.
4. Reject with `400` if the signature is invalid.
5. Reject with `400` if the timestamp is more than 5 minutes from the server's current time.
6. Reject with `400` if the nonce has been seen within the last 10 minutes. Servers MUST maintain a nonce store for at least 10 minutes.

Servers SHOULD indicate verification result in the `X-Tollway-Verified` response header.

---

## 6. The Tollway Policy File

### 6.1 Discovery

Sites MUST serve their policy at:
```
/.well-known/tollway.json
```

The response MUST have `Content-Type: application/json`. Agents SHOULD cache the policy for the duration specified in `cache_ttl_seconds`, defaulting to 5 minutes if absent.

### 6.2 Schema

```jsonc
{
  "version": "0.1",                          // REQUIRED
  "updated": "2026-03-13T00:00:00.000Z",

  "identity": {
    "require_did": false,                    // Reject requests without X-Tollway-DID
    "minimum_reputation": 0.5,              // 0.0–1.0; checked against reputation oracle
    "allowed_principals": ["did:key:z6Mk..."],
    "blocked_principals": ["did:key:z6Bad..."]
  },

  "pricing": {
    "currency": "USDC",
    "free_requests_per_day": 100,
    "default_per_request": "0.001",
    "schedule": [
      { "action": "read",       "price": "0.001" },
      { "action": "summarize",  "price": "0.005" },
      { "action": "train",      "price": "0.05"  }
    ]
  },

  "data_policy": {
    "cache_allowed": true,
    "cache_ttl_seconds": 3600,
    "training_allowed": false,
    "attribution_required": true,
    "attribution_format": "{title} ({url})"  // Tokens: {title}, {url}, {author}, {date}
  },

  "rate_limits": {
    "requests_per_minute": 30,
    "requests_per_day": 1000
  },

  "actions": {
    "allowed": ["read", "search", "summarize"],
    "prohibited": ["scrape_bulk"],           // Returns 403
    "require_payment": ["train"]             // Returns 402
  },

  "endpoints": {
    "agent_api": "https://example.com/api/agent",
    "schema_url": "https://example.com/.well-known/tollway-schema.yaml",
    "payment_address": "0xYourAddress",
    "payment_network": "base"
  }
}
```

All fields except `version` are OPTIONAL. Absent fields imply permissive defaults.

---

## 7. HTTP 402 Payment Flow

### 7.1 Flow

```
Agent  →  GET /article  (X-Tollway-Scope: train)
Server →  402 Payment Required  { price, payment_address, payment_id, ... }
Agent  →  sends USDC on-chain to payment_address
Agent  →  GET /article  (X-Tollway-Payment: { tx_hash, payment_id, ... })
Server →  200 OK  (after verifying tx on-chain)
```

### 7.2 402 Response Body

```json
{
  "tollway_version": "0.1",
  "price": "0.05",
  "currency": "USDC",
  "network": "base",
  "payment_address": "0xYourAddress",
  "payment_id": "pay_abc123",
  "expires_at": "2026-03-13T14:10:00.000Z",
  "memo": "train access: /articles/climate-change"
}
```

### 7.3 Payment Receipt Header

```json
{
  "tx_hash": "0xabc123...",
  "network": "base",
  "payment_id": "pay_abc123",
  "amount": "0.05",
  "currency": "USDC"
}
```

Servers MUST verify the transaction on-chain before serving content. Servers SHOULD cache verified receipts by `payment_id`.

### 7.4 USDC Contract Addresses

| Network | Chain ID | USDC Address |
|---------|----------|-------------|
| Base mainnet | 8453 | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| Base Sepolia | 84532 | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |

---

## 8. Response Headers

| Header | Description |
|--------|-------------|
| `X-Tollway-Version` | Protocol version used by this server |
| `X-Tollway-Served` | `true` — indicates Tollway middleware processed this request |
| `X-Tollway-Verified` | `true` if the agent signature was verified; `false` otherwise |
| `X-Tollway-Scope` | The scope that was applied |
| `X-Tollway-Policy-Updated` | `true` if the policy has changed since last fetch |

---

## 9. Error Codes

| Status | `error` value | Reason |
|--------|--------------|--------|
| `400` | `timestamp_invalid` | Timestamp more than 5 minutes from server time |
| `400` | `nonce_replayed` | Nonce already seen within 10 minutes |
| `400` | `did_invalid` | Malformed DID |
| `400` | `signature_invalid` | Ed25519 signature verification failed |
| `402` | _(see §7.2)_ | Payment required |
| `403` | `scope_prohibited` | Scope in `actions.prohibited` |
| `403` | `did_not_allowed` | DID not in `identity.allowed_principals` |
| `403` | `did_blocked` | DID in `identity.blocked_principals` |
| `403` | `reputation_insufficient` | Reputation score below `minimum_reputation` |
| `429` | `rate_limit_exceeded` | Request rate exceeded |

---

## 10. Conformance Levels

| Level | Requirements |
|-------|-------------|
| **Basic** | Serves `/.well-known/tollway.json`; reads and logs `X-Tollway-*` headers |
| **Identity** | Validates DID, timestamp, nonce, and signature; enforces allowed/prohibited actions |
| **Payment** | Implements the full 402 flow; verifies on-chain payment receipts |
| **Full** | All of the above plus rate limiting and reputation gating |

---

## 11. Security Considerations

**Replay attacks:** Servers MUST reject nonces seen within the last 10 minutes. Distributed deployments SHOULD use a shared nonce store.

**Timestamp skew:** Servers MUST reject requests whose timestamp is more than 5 minutes from server time. Both parties are assumed to be NTP-synchronized.

**DID spoofing:** The DID is derived from the public key — no central registry exists. Servers MUST NOT trust a DID without verifying the signature.

**Payment verification:** Servers MUST verify payment receipts on-chain. Accepting an unverified `tx_hash` is equivalent to not enforcing payment.

**Rate limit evasion:** Adversaries may generate many DIDs to evade per-DID limits. Servers SHOULD apply IP-level rate limiting as a secondary defence.

---

## 12. Changelog

| Version | Date | Notes |
|---------|------|-------|
| 0.1 | 2026-03-13 | Initial draft |

---

## Implementations

| Language | Package | Type |
|----------|---------|------|
| TypeScript | [`@tollway/client`](https://npmjs.com/package/@tollway/client) | Agent client |
| TypeScript | [`@tollway/server`](https://npmjs.com/package/@tollway/server) | Server middleware (Express, Next.js) |
| TypeScript | [`@tollway/cli`](https://npmjs.com/package/@tollway/cli) | CLI tool |
| TypeScript | [`@tollway/payments`](https://npmjs.com/package/@tollway/payments) | USDC payment handler |
| Python | [`tollway-server`](https://pypi.org/project/tollway-server) | Server middleware (Flask, FastAPI) |

*This specification is licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).*

# Tollway

**The open protocol for how AI agents access the web.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Spec: v0.1](https://img.shields.io/badge/Spec-v0.1-blue.svg)](./SPEC.md)
[![npm: @tollway/client](https://img.shields.io/npm/v/@tollway/client.svg)](https://npmjs.com/package/@tollway/client)

---

AI agents now generate more web traffic than humans. Yet every agent that hits a website is anonymous — indistinguishable from a scraper, a DDoS bot, or a competing crawler. Sites respond the only way they can: block everything and ask questions later.

**Tollway gives agents an identity they can stand behind.**

An agent running Tollway attaches a signed identifier to every request: who it is, what it's trying to do, and why. Sites that speak Tollway can verify that identity cryptographically and make real decisions — serve richer content to trusted agents, apply different rate limits, enforce attribution, or optionally charge for premium access.

Think of it as `robots.txt` for the agentic era — with identity, policy, and structured extraction built in. Payments are there when you need them, but they're not the point.

---

## How It Works

**1. Site publishes `/.well-known/tollway.json`**
```json
{
  "version": "0.1",
  "data_policy": {
    "training_allowed": false,
    "attribution_required": true,
    "cache_ttl_seconds": 3600
  },
  "actions": {
    "allowed": ["read", "search", "summarize"],
    "prohibited": ["scrape_bulk"]
  },
  "rate_limits": { "requests_per_minute": 60 }
}
```

**2. Agent attaches identity headers**
```http
X-Tollway-DID: did:key:z6Mk...
X-Tollway-Purpose: market-research
X-Tollway-Scope: read
X-Tollway-Signature: base64url(ed25519_signature)
```

**3. Site verifies identity and serves content**

The site knows who's asking, what for, and can make a real decision. That's the core loop.

**Optional: charge for premium access**
Sites can also return `HTTP 402` with a USDC price. The agent pays on Base and retries with a receipt. No accounts, no billing dashboards — but only worth enabling once you have agents you trust.

---

## Packages

| Package | Description | Install |
|---|---|---|
| [`@tollway/client`](./packages/tollway-client) | TypeScript agent client. Attaches identity headers, reads `tollway.json`, handles `402` payment retries with Ed25519 signing, and applies community CSS extraction schemas. | `npm i @tollway/client` |
| [`@tollway/server`](./packages/tollway-server) | Express/Next.js middleware. Serves `tollway.json`, validates signatures, enforces nonce/timestamp, returns `402` for paid actions. | `npm i @tollway/server` |
| [`@tollway/cli`](./packages/tollway-cli) | CLI tool. `tollway init` generates a DID keypair; `tollway fetch` makes signed requests from the terminal. | `npm i -g @tollway/cli` |
| [`@tollway/payments`](./packages/tollway-payments) | USDC payment handler for Base mainnet + Sepolia. Integrates with `@tollway/client` to complete `402` flows on-chain. | `npm i @tollway/payments` |
| [`@tollway/reputation`](./packages/tollway-reputation) | Reference reputation oracle. Tracks agent DID scores from server observations. Run standalone or embed in your own server. | `npm i @tollway/reputation` |
| [`@tollway/langchain`](./packages/tollway-langchain) | LangChain integration. `TollwayRetriever` and `TollwayLoader` — fetch web content via Tollway inside any LangChain chain or agent. | `npm i @tollway/langchain` |
| [`@tollway/llamaindex`](./packages/tollway-llamaindex) | LlamaIndex integration. `TollwayReader` — load web documents via Tollway into any LlamaIndex pipeline. | `npm i @tollway/llamaindex` |
| [`tollway-server`](./sdks/python) | Python middleware for Flask and FastAPI. Ed25519 verification via PyNaCl, same protocol semantics as the TypeScript server. | `pip install tollway-server` |

---

## Quick Start

### For Agent Developers

```typescript
import { fetch } from '@tollway/client';

// Drop-in replacement for fetch — adds identity headers automatically
const result = await fetch('https://techcrunch.com/2026/01/01/ai-news/', {
  tollway: {
    did: process.env.AGENT_DID,
    privateKey: process.env.AGENT_PRIVATE_KEY,
    purpose: 'competitive-research',
    scope: 'read',
  }
});

console.log(result.data);        // Structured JSON if schema available
console.log(result.text);        // Raw text content
console.log(result.attribution); // "TechCrunch (https://...)" if required
console.log(result.policy);      // Site's declared rules for agents
```

### For Site Owners

```typescript
import { tollwayMiddleware } from '@tollway/server';

// Express — start here, add pricing later if you want it
app.use(tollwayMiddleware({
  policy: {
    trainingAllowed: false,
    attributionRequired: true,
    allowedActions: ['read', 'search', 'summarize'],
    prohibitedActions: ['scrape_bulk'],
  },
}));
```

This automatically:
- Serves `/.well-known/tollway.json` so agents can read your policy
- Validates DID signatures — you know exactly which agent is making each request
- Enforces nonce and timestamp freshness to prevent replay attacks
- Logs structured agent traffic to your application output
- **Optional:** add `paymentAddress` + `pricing` to enable paid access

---

## The Schema Library

The `/schemas` directory contains community-maintained extraction schemas for popular sites — CSS selectors that return clean structured JSON without LLM calls.

```yaml
# schemas/techcrunch.yaml
site: techcrunch.com
version: "1"
selectors:
  title: "h1.article-title"
  author: ".byline .author-name"
  published_at: "time[datetime]"
  content: ".article-content p"
  tags: ".tag-list a"
```

**[Browse schemas →](./schemas)**  
**[Contribute a schema →](./CONTRIBUTING.md)**

---

## Why Not Just Use...

**Cloudflare Pay Per Crawl?**
Centralized and limited to Cloudflare-proxied sites. Tollway is the open standard — Cloudflare's implementation could be built on top of it.

**MCP / A2A?**
MCP connects agents to tools. A2A connects agents to agents. Neither addresses how agents access arbitrary open web content. Tollway fills that gap.

**robots.txt?**
`robots.txt` is binary allow/deny with no identity and no way to distinguish agents. Tollway is its successor — same simple deployment, far richer semantics.

---

## Conformance Levels

| Level | Requirements |
|---|---|
| **Basic** | Serves `/.well-known/tollway.json`; reads and logs `X-Tollway-*` headers |
| **Identity** | Validates DID, timestamp, nonce, and signature; enforces allowed/prohibited actions |
| **Payment** | Implements the full `402` flow; verifies on-chain payment receipts |
| **Full** | All of the above plus rate limiting and reputation gating |

Start at Basic in 5 minutes. Upgrade as needed.

---

## Project Structure

```
/
├── SPEC.md                    # The full protocol specification (CC BY 4.0)
├── HN_LAUNCH.md               # Launch post draft
├── packages/
│   ├── tollway-client/        # TypeScript agent client (@tollway/client)
│   ├── tollway-server/        # Express/Next.js middleware (@tollway/server)
│   ├── tollway-cli/           # CLI tool (@tollway/cli)
│   ├── tollway-payments/      # USDC payment handler (@tollway/payments)
│   ├── tollway-reputation/    # Reputation oracle server (@tollway/reputation)
│   ├── tollway-langchain/     # LangChain integration (@tollway/langchain)
│   └── tollway-llamaindex/    # LlamaIndex integration (@tollway/llamaindex)
├── schemas/                   # Community CSS extraction schemas (10+ sites)
├── sdks/
│   └── python/                # Python SDK (tollway-server on PyPI)
├── demo/                      # Live demo server (tollway.vercel.app)
└── website/                   # Landing page (static)
```

---

## Roadmap

- [x] v0.1 spec (SPEC.md)
- [x] `@tollway/client` — TypeScript agent client with YAML schema extraction
- [x] `@tollway/server` — Express/Next.js middleware
- [x] `@tollway/cli` — CLI tool with DID keygen
- [x] `@tollway/payments` — USDC payment handler (Base)
- [x] `tollway-server` — Python SDK (Flask + FastAPI)
- [x] Live demo server
- [x] `@tollway/langchain` — LangChain `TollwayRetriever` + `TollwayLoader`
- [x] `@tollway/llamaindex` — LlamaIndex `TollwayReader`
- [x] `@tollway/reputation` — Reference reputation oracle
- [ ] IETF Internet Draft submission

---

## Contributing

Tollway lives or dies by community adoption. The three highest-value contributions right now:

1. **Write an integration** for your agent framework of choice (LangChain, LlamaIndex, etc.)
2. **Implement the server** in another language (Go, Rust, Ruby)
3. **Adopt Tollway** on your site and share your experience

Open an issue or PR — all feedback welcome.

---

## License

- Protocol specification: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
- Reference implementations: [MIT](./LICENSE)

---

*Built because the web and AI agents should be able to work together.*
*Discuss on [Discord](https://discord.gg/tollway) · Follow on [Twitter](https://twitter.com/tollway_dev)*

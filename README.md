# Tollway

**The open protocol for how AI agents access the web.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Spec: v0.1](https://img.shields.io/badge/Spec-v0.1-blue.svg)](./SPEC.md)
[![Discord](https://img.shields.io/badge/Discord-Join-7289DA.svg)](https://discord.gg/tollway)
[![npm: @tollway/client](https://img.shields.io/npm/v/%40tollway%2Fclient.svg)](https://npmjs.com/package/@tollway/client)

---

AI agents now generate more web traffic than humans. Yet there's no standard for how they should identify themselves, request permission, or compensate publishers. The result: an arms race between agents and sites, with both sides losing.

**Tollway makes the relationship cooperative.**

Sites publish a `tollway.json` file declaring what agents can do and what they should pay. Agents attach identity headers proving who they are and why they're there. Both sides win: publishers get revenue and control, agents get reliable access and structured data.

Think of it as `robots.txt` for the agentic era — with identity, economics, and structured extraction built in.

---

## How It Works

**1. Site publishes `/.well-known/tollway.json`**
```json
{
  "version": "0.1",
  "pricing": {
    "free_requests_per_day": 100,
    "schedule": [{ "action": "read", "price": "0.001" }]
  },
  "data_policy": {
    "training_allowed": false,
    "attribution_required": true
  }
}
```

**2. Agent attaches identity headers**
```http
X-Tollway-DID: did:key:z6Mk...
X-Tollway-Purpose: market-research
X-Tollway-Scope: read
X-Tollway-Signature: base64url(ed25519_signature)
```

**3. Site responds with content or a 402 + price**
```json
{ "price": "0.001", "currency": "USDC", "address": "0x..." }
```

**4. Agent pays, retries, gets structured data back**

That's it.

---

## Packages

| Package | Description | Install |
|---|---|---|
| [`@tollway/client`](./packages/tollway-client) | Drop-in fetch wrapper. Attaches identity headers, reads `tollway.json`, retries Tollway `402` flows, and extracts basic structured metadata. | `npm i @tollway/client` |
| [`@tollway/server`](./packages/tollway-server) | Express/Next.js middleware. Serves `tollway.json`, parses agent headers, enforces nonce/timestamp checks, and returns Tollway `402` payment requests. | `npm i @tollway/server` |

---

## Quick Start

### For Agent Developers

```typescript
import { fetch } from '@tollway/client';

// Drop-in replacement for fetch
// Automatically handles: identity headers, payment flows, structured extraction
const result = await fetch('https://techcrunch.com/2026/01/01/ai-news/', {
  tollway: {
    did: process.env.AGENT_DID,
    privateKey: process.env.AGENT_PRIVATE_KEY,
    wallet: process.env.AGENT_WALLET,
    purpose: 'competitive-research',
    scope: 'read',
  }
});

console.log(result.data);        // Structured JSON if schema available
console.log(result.text);        // Raw text content
console.log(result.attribution); // "TechCrunch (https://...)"
console.log(result.paid);        // true/false
console.log(result.cost);        // "0.001" USDC
```

### For Site Owners

```typescript
import { tollwayMiddleware } from '@tollway/server';

// Express
app.use(tollwayMiddleware({
  policy: {
    freeRequestsPerDay: 100,
    pricing: [{ action: 'read', price: '0.001' }],
    trainingAllowed: false,
    attributionRequired: true,
  },
  paymentAddress: process.env.WALLET_ADDRESS,
}));
```

This automatically:
- Serves `/.well-known/tollway.json`
- Parses Tollway identity headers
- Enforces nonce and timestamp freshness checks
- Returns `402` with pricing for configured paid actions
- Logs agent traffic to your application output

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
Cloudflare's implementation is centralized and covers ~20% of the web. Tollway is the open standard that any implementation — including Cloudflare's — can build on.

**MCP / A2A?**  
MCP connects agents to tools. A2A connects agents to agents. Neither addresses how agents access arbitrary open web content. Tollway fills that gap.

**robots.txt?**  
`robots.txt` is binary allow/deny with no identity, no economics, and no structured data. Tollway is its successor.

---

## Conformance Levels

| Level | What It Means |
|---|---|
| **Level 0** | Serves `tollway.json` with basic policy |
| **Level 1** | Validates agent identity + DID signatures |
| **Level 2** | Enforces identity + minimum reputation scores |
| **Level 3** | Full: identity + reputation + payment flows |

Start at Level 0 in 5 minutes. Upgrade as needed.

---

## Project Structure

```text
/
|-- SPEC.md                    # The full protocol specification
|-- GOVERNANCE.md              # How decisions are made
|-- CONTRIBUTING.md            # How to contribute
|-- schemas/                   # Community extraction schemas
|   |-- techcrunch.yaml
|   |-- hackernews.yaml
|   |-- arxiv.yaml
|   `-- ...
|-- packages/
|   |-- tollway-client/        # TypeScript client library
|   `-- tollway-server/        # Server middleware
|-- examples/
|   |-- basic-agent/
|   `-- express-site/
`-- rfcs/                      # Proposed spec changes
```

---

## Roadmap

- [x] v0.1 spec
- [x] `tollway-client` v0.1
- [x] `tollway-server` v0.1
- [x] Schema library seed (10 sites)
- [ ] `tollway-translator` v0.1
- [ ] LangChain integration
- [ ] LlamaIndex connector
- [ ] Reputation oracle reference implementation
- [ ] IETF Internet Draft submission
- [ ] W3C Community Group

---

## Contributing

Tollway lives or dies by community adoption. The three highest-value contributions right now:

1. **Add a schema** for a site you use frequently — [see template](./schemas/TEMPLATE.yaml)
2. **Write an integration** for your agent framework of choice
3. **Adopt Tollway** on your site and share your experience

[Read CONTRIBUTING.md →](./CONTRIBUTING.md)

---

## Governance

Tollway is steered by its contributors. No single company controls the spec.

- Spec changes require an RFC with 2-week comment period
- Any contributor with 3+ merged PRs may vote on RFC acceptance
- The goal is eventual transfer to a neutral foundation (Linux Foundation preferred)

[Read GOVERNANCE.md →](./GOVERNANCE.md)

---

## License

- Protocol specification: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
- Reference implementations: [MIT](./LICENSE)
- Schema library: [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)

---

*Built because the web and AI agents should be able to work together.*  
*Discuss on [Discord](https://discord.gg/tollway) · Follow on [Twitter](https://twitter.com/tollway_dev)*

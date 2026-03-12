# @tollway/server

Express and Next.js middleware for the [Tollway protocol](https://tollway.dev). Automatically serves `/.well-known/tollway.json`, validates agent identity headers, enforces rate limits, and handles HTTP 402 payment flows.

Part of the Tollway open protocol — robots.txt rebuilt for the agentic era.

## Install

```bash
npm install @tollway/server
```

## Quick Start — Express

```ts
import express from 'express';
import { tollwayMiddleware } from '@tollway/server';

const app = express();

app.use(tollwayMiddleware({
  policy: {
    freeRequestsPerDay: 100,
    trainingAllowed: false,
    attributionRequired: true,
    prohibitedActions: ['scrape_bulk'],
    paymentRequiredActions: ['train'],
    pricing: [
      { action: 'read',      price: '0.001' },
      { action: 'summarize', price: '0.005' },
      { action: 'train',     price: '0.05'  },
    ],
  },
  paymentAddress: process.env.WALLET_ADDRESS, // USDC address on Base
}));
```

Your policy is now live at `GET /.well-known/tollway.json`. All agent requests are validated, rate-limited, and logged automatically.

## Quick Start — Next.js

```ts
// middleware.ts
import { createNextjsMiddleware } from '@tollway/server';

const tollway = createNextjsMiddleware({
  policy: {
    freeRequestsPerDay: 100,
    trainingAllowed: false,
    prohibitedActions: ['scrape_bulk'],
  },
  paymentAddress: process.env.WALLET_ADDRESS,
});

export async function middleware(request: Request) {
  const response = await tollway(request);
  if (response) return response; // handled by Tollway (policy, 402, etc.)
  // your normal middleware continues here
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

## Generate `tollway.json` standalone

No server needed — generate a static policy file to host anywhere:

```ts
import { generateTollwayJson } from '@tollway/server';

const json = generateTollwayJson(
  {
    freeRequestsPerDay: 1000,
    trainingAllowed: false,
    attributionRequired: true,
    prohibitedActions: ['scrape_bulk'],
  },
  '0xYourWalletAddress',
);

// Write to public/.well-known/tollway.json
```

## API

### `tollwayMiddleware(options)` → Express middleware

| Option | Type | Description |
|--------|------|-------------|
| `policy` | `ServerPolicy` | Site policy (see below) |
| `paymentAddress` | `string?` | USDC address for micropayments |
| `paymentNetwork` | `string?` | Chain (default: `"base"`) |
| `enableLogging` | `boolean?` | Log agent requests (default: `true`) |
| `onAgentRequest` | `fn?` | Callback on every verified agent request |
| `onPayment` | `fn?` | Callback on payment received |

### `ServerPolicy`

```ts
{
  freeRequestsPerDay?: number;      // free tier before payment kicks in
  pricing?: { action, price }[];    // per-action USDC prices
  trainingAllowed?: boolean;
  attributionRequired?: boolean;
  attributionFormat?: string;       // e.g. "{title} ({url})"
  cacheAllowed?: boolean;
  cacheTtlSeconds?: number;
  minimumReputation?: number;       // 0–1
  requireDid?: boolean;
  allowedActions?: string[];
  prohibitedActions?: string[];     // e.g. ["scrape_bulk", "train"]
  paymentRequiredActions?: string[];
  requestsPerMinute?: number;
  requestsPerDay?: number;
}
```

### What the middleware does

For every request:

1. **Serves policy** — `GET /.well-known/tollway.json` returns your policy JSON
2. **Passes through** — non-agent requests (no `X-Tollway-*` headers) continue normally
3. **Validates timestamp** — rejects requests outside a ±5-minute window
4. **Checks nonce** — prevents replay attacks
5. **Verifies DID** — validates `did:key` Ed25519 signatures
6. **Enforces actions** — 403 for prohibited scopes
7. **Rate limits** — 429 per DID per minute/day
8. **Handles payment** — 402 with payment details if action requires it
9. **Attaches identity** — sets `req.tollwayIdentity` for downstream handlers
10. **Responds headers** — adds `X-Tollway-Served: 1` to responses

### Accessing agent identity downstream

```ts
app.get('/article', (req, res) => {
  const agent = req.tollwayIdentity; // AgentIdentity | undefined
  if (agent) {
    console.log(agent.did, agent.purpose, agent.scope, agent.verified);
  }
  // ...
});
```

## Production notes

The default nonce store and rate-limit counters are **in-memory**. For multi-instance deployments, replace them with Redis. See [CONTRIBUTING.md](https://github.com/TollwayProtocol/Tollway/blob/main/CONTRIBUTING.md) for guidance.

## Protocol

`@tollway/server` implements the [Tollway v0.1 specification](https://github.com/TollwayProtocol/Tollway/blob/main/SPEC.md).

- **Spec:** CC BY 4.0
- **Code:** MIT
- **GitHub:** [TollwayProtocol/Tollway](https://github.com/TollwayProtocol/Tollway)

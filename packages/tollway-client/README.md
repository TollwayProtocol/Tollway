# @tollway/client

Drop-in `fetch` replacement for AI agents. Handles Tollway identity headers, site policy enforcement, HTTP 402 payment flows, and structured data extraction automatically.

Part of the [Tollway open protocol](https://tollway.dev) — robots.txt rebuilt for the agentic era.

## Install

```bash
npm install @tollway/client
```

## Quick Start

```ts
import { createAgent } from '@tollway/client';

const agent = createAgent({
  did: process.env.AGENT_DID,           // did:key:z6Mk...
  privateKey: process.env.AGENT_KEY,    // Ed25519 private key (hex)
  purpose: 'Summarise recent AI news',
  scope: 'read',
});

const result = await agent.fetch('https://techcrunch.com/2026/03/09/ai-news/');

console.log(result.data);        // { title, description, url, domain }
console.log(result.attribution); // "TechCrunch (https://...)" if required
console.log(result.paid);        // true if a micropayment was made
console.log(result.cost);        // "0.001" USDC
console.log(result.policy);      // site's tollway.json policy
```

## API

### `createAgent(options)`

Returns an agent instance bound to a set of identity options.

```ts
const agent = createAgent({
  did: 'did:key:z6Mk...',        // required — your agent's DID
  privateKey: '...',             // required — Ed25519 private key (hex)
  purpose: 'Research',           // required — human-readable intent
  scope: 'read',                 // required — read | search | summarize | train | scrape_bulk
  wallet: '0x...',               // optional — USDC wallet for payments
  maxPriceUsdc: '0.01',          // optional — max per-request price (default 0.01)
  principalDid: 'did:key:...',   // optional — operator DID if different from agent
  framework: 'langchain/0.3.0',  // optional — framework identifier
  reputationOracle: 'https://...', // optional — custom reputation oracle
});

agent.fetch(url, init?)     // fetch with identity headers attached
agent.checkPolicy(url)      // fetch site's tollway.json without making a request
agent.options               // the options this agent was created with
```

### `fetch(url, init?)`

Low-level fetch with optional `tollway` options. Use `createAgent` for most cases.

```ts
import { fetch } from '@tollway/client';

const result = await fetch('https://example.com/', {
  tollway: { did, privateKey, purpose, scope },
});
```

### `getReputation(did, oracle?)`

Look up an agent's reputation score from a Tollway reputation oracle.

```ts
import { getReputation } from '@tollway/client';

const rep = await getReputation('did:key:z6Mk...');
// { score: 0.95, observations: 1234, flags: [] }
```

## How It Works

1. **Policy fetch** — checks `/.well-known/tollway.json` on the target site (cached 5 min)
2. **Identity headers** — attaches `X-Tollway-DID`, `X-Tollway-Purpose`, `X-Tollway-Scope`, `X-Tollway-Nonce`, `X-Tollway-Timestamp`, and an Ed25519 `X-Tollway-Signature`
3. **402 handling** — if the site returns HTTP 402, attempts payment via x402 (USDC on Base) and retries
4. **Extraction** — parses OG tags and metadata from HTML responses into structured JSON

## Generating a DID + Key Pair

```ts
import { generateKeyPair } from '@noble/ed25519';
import { base58btc } from 'multiformats/bases/base58';

const privKey = crypto.getRandomValues(new Uint8Array(32));
const pubKey = await generateKeyPair(privKey); // ed25519

// Multicodec prefix for Ed25519 public key: 0xed01
const multicodecKey = new Uint8Array([0xed, 0x01, ...pubKey]);
const did = `did:key:z${base58btc.encode(multicodecKey)}`;
const privateKeyHex = Buffer.from(privKey).toString('hex');
```

## Protocol

`@tollway/client` implements the [Tollway v0.1 specification](https://github.com/TollwayProtocol/Tollway/blob/main/SPEC.md).

- **Spec:** CC BY 4.0
- **Code:** MIT
- **GitHub:** [TollwayProtocol/Tollway](https://github.com/TollwayProtocol/Tollway)

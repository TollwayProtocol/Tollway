# @tollway/llamaindex

LlamaIndex integration for the [Tollway Protocol](https://tollway.dev).

Provides `TollwayReader` — a drop-in LlamaIndex `BaseReader` that fetches web content through the Tollway protocol, handling agent identity, site policy, and USDC micropayment flows automatically.

## Install

```bash
npm install @tollway/llamaindex llamaindex
```

## Quick Start

```typescript
import { TollwayReader } from '@tollway/llamaindex';

const reader = new TollwayReader({
  did: process.env.AGENT_DID!,
  privateKey: process.env.AGENT_PRIVATE_KEY!,
  wallet: process.env.AGENT_WALLET,     // optional — enables auto-payment
  purpose: 'research',
  maxPriceUsdc: '0.01',
});

const docs = await reader.loadData([
  'https://techcrunch.com/2026/01/01/example/',
  'https://arxiv.org/abs/2401.00000',
]);

console.log(docs[0].text);
console.log(docs[0].metadata.tollway_paid);    // true/false
console.log(docs[0].metadata.tollway_cost);    // "0.001" USDC
console.log(docs[0].metadata.tollway_attribution);
```

## With VectorStoreIndex

```typescript
import { TollwayReader } from '@tollway/llamaindex';
import { VectorStoreIndex } from 'llamaindex';

const reader = new TollwayReader({
  did: process.env.AGENT_DID!,
  privateKey: process.env.AGENT_PRIVATE_KEY!,
  purpose: 'indexing',
});

const docs = await reader.loadData([
  'https://example.com/page-1',
  'https://example.com/page-2',
]);

const index = await VectorStoreIndex.fromDocuments(docs);
const queryEngine = index.asQueryEngine();
const response = await queryEngine.query({ query: 'What is this about?' });
```

## With Automatic Payments

```typescript
import { TollwayReader } from '@tollway/llamaindex';
import { createPaymentHandler } from '@tollway/payments';

const reader = new TollwayReader({
  did: process.env.AGENT_DID!,
  privateKey: process.env.AGENT_PRIVATE_KEY!,
  purpose: 'research',
  onPaymentRequired: createPaymentHandler({
    privateKey: process.env.AGENT_WALLET_PRIVATE_KEY!,
    maxPriceUsdc: '0.05',
  }),
});
```

## Options

| Option | Type | Required | Description |
|---|---|---|---|
| `did` | `string` | Yes | Agent's Decentralized Identifier |
| `privateKey` | `string` | Yes | Ed25519 private key (hex) |
| `wallet` | `string` | No | Wallet address for auto-payment |
| `purpose` | `string` | No | Human-readable request purpose |
| `scope` | `string` | No | `read` \| `search` \| `summarize` \| `train` \| `scrape_bulk` (default: `read`) |
| `maxPriceUsdc` | `string` | No | Max price per request in USDC (default: `"0.01"`) |
| `onPaymentRequired` | `function` | No | Custom payment handler (use `@tollway/payments`) |

## Get a DID

```bash
npx @tollway/cli init
```

## License

MIT

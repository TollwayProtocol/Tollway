# @tollway/langchain

LangChain integration for the [Tollway Protocol](https://tollway.dev).

Provides `TollwayRetriever` and `TollwayLoader` — drop-in LangChain components that fetch web content through the Tollway protocol, handling agent identity, site policy, and USDC micropayment flows automatically.

## Install

```bash
npm install @tollway/langchain @langchain/core
```

## Quick Start

```typescript
import { TollwayRetriever } from '@tollway/langchain';
import { ChatAnthropic } from '@langchain/anthropic';
import { createRetrievalChain } from 'langchain/chains/retrieval';

const retriever = new TollwayRetriever({
  did: process.env.AGENT_DID!,
  privateKey: process.env.AGENT_PRIVATE_KEY!,
  wallet: process.env.AGENT_WALLET,     // optional — enables auto-payment
  purpose: 'competitive-research',
  maxPriceUsdc: '0.01',
});

// Pass any URL as the query — the retriever fetches it via Tollway
const docs = await retriever.invoke('https://techcrunch.com/2026/01/01/example/');

console.log(docs[0].pageContent);
console.log(docs[0].metadata.tollway_paid);    // true/false
console.log(docs[0].metadata.tollway_cost);    // "0.001" USDC
console.log(docs[0].metadata.tollway_attribution); // attribution string
```

## With Fixed URLs

```typescript
const retriever = new TollwayRetriever({
  did: process.env.AGENT_DID!,
  privateKey: process.env.AGENT_PRIVATE_KEY!,
  purpose: 'research',
  urls: [
    'https://example.com/article-1',
    'https://example.com/article-2',
  ],
});

// Fetches all configured URLs, ignores the query string
const docs = await retriever.invoke('');
```

## TollwayLoader

For load-then-split workflows:

```typescript
import { TollwayLoader } from '@tollway/langchain';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';

const loader = new TollwayLoader({
  did: process.env.AGENT_DID!,
  privateKey: process.env.AGENT_PRIVATE_KEY!,
  urls: ['https://example.com/page-1', 'https://example.com/page-2'],
  purpose: 'summarization',
});

const docs = await loader.load();
const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 1000 });
const chunks = await splitter.splitDocuments(docs);
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
| `urls` | `string[]` | No | Fixed URLs to retrieve |
| `onPaymentRequired` | `function` | No | Custom payment handler (use `@tollway/payments`) |

## Get a DID

```bash
npx @tollway/cli init
```

## License

MIT

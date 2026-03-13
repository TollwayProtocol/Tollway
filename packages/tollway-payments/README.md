# @tollway/payments

USDC micropayment handler for the [Tollway protocol](https://tollway.dev). Sends on-chain USDC transfers on Base (mainnet or Sepolia testnet) via [viem](https://viem.sh) when a site returns HTTP 402 Payment Required.

Part of the Tollway open protocol — robots.txt rebuilt for the agentic era.

## Install

```bash
npm install @tollway/payments
```

## Quick Start

```ts
import { createAgent } from '@tollway/client';
import { createPaymentHandler } from '@tollway/payments';

const agent = createAgent({
  did: process.env.AGENT_DID,
  privateKey: process.env.AGENT_KEY,
  purpose: 'Research',
  scope: 'read',

  // Wire up the payment handler
  onPaymentRequired: createPaymentHandler({
    walletPrivateKey: process.env.WALLET_PRIVATE_KEY,
    maxPriceUsdc: '0.01',   // never pay more than 1 cent per request
  }),
});

// Now agent.fetch() will automatically pay 402s
const result = await agent.fetch('https://example.com/premium-content');
console.log(result.paid);   // true if a payment was made
console.log(result.cost);   // '0.001' (USDC)
```

## API

### `createPaymentHandler(options)`

Returns an `onPaymentRequired` callback compatible with `@tollway/client`'s `TollwayOptions`.

```ts
createPaymentHandler({
  walletPrivateKey: string;   // Ed25519 private key hex (with or without 0x)
  maxPriceUsdc?: string;      // Maximum price per request (default: '0.01')
  rpcUrl?: string;            // Override RPC endpoint
})
```

The handler:
1. Checks the requested price against `maxPriceUsdc`
2. Resolves the USDC contract address for the requested network (Base mainnet or Base Sepolia)
3. Submits a USDC `transfer()` transaction via viem
4. Waits for on-chain confirmation
5. Returns a JSON receipt string: `{ tx_hash, network, payment_id, amount, currency }`

### Networks

| Network key | Chain | USDC address |
|---|---|---|
| `base` | Base mainnet | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| `base-sepolia` | Base Sepolia testnet | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |

## Testing

For testnet development, use `base-sepolia`. Get free testnet USDC from the [Circle faucet](https://faucet.circle.com/).

## Protocol

`@tollway/payments` implements the payment flow defined in the [Tollway v0.1 specification](https://github.com/TollwayProtocol/Tollway/blob/main/SPEC.md).

- **Spec:** CC BY 4.0
- **Code:** MIT
- **GitHub:** [TollwayProtocol/Tollway](https://github.com/TollwayProtocol/Tollway)

/**
 * Basic Tollway Agent Example
 *
 * Shows how to use @tollway/client as a drop-in fetch replacement.
 * The agent attaches identity headers, respects site policies,
 * and handles payment flows automatically.
 *
 * Run: npx tsx index.ts
 */

import { createAgent } from '@tollway/client';

// Configure your agent's identity once
const agent = createAgent({
  did: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
  privateKey: process.env.TOLLWAY_PRIVATE_KEY ?? '',
  purpose: 'Research AI safety papers for summarization',
  scope: 'read',
  framework: 'custom/0.1.0',

  // Optional: enable payment flows
  wallet: process.env.TOLLWAY_WALLET_ADDRESS,
  maxPriceUsdc: '0.01',
});

// Check a site's policy before fetching
const policy = await agent.checkPolicy('https://arxiv.org/abs/2301.07041');
if (policy) {
  console.log('Training allowed:', policy.data_policy?.training_allowed ?? 'unspecified');
  console.log('Cache TTL:', policy.data_policy?.cache_ttl_seconds ?? 'unspecified');
}

// Fetch with identity headers, policy enforcement, and auto structured extraction
const result = await agent.fetch('https://arxiv.org/abs/2301.07041');

console.log('Status:', result.status);
console.log('Title:', result.data?.title);
console.log('Description:', result.data?.description);

if (result.attribution) {
  console.log('\nAttribution (required by site):', result.attribution);
}

if (result.paid) {
  console.log(`\nPaid ${result.cost} USDC for access`);
}

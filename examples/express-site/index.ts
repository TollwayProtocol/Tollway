/**
 * Express Site Example
 *
 * Shows how to use @tollway/server to make an Express app
 * Tollway-compliant: serves tollway.json, validates agent identity,
 * enforces rate limits, and handles payment flows.
 *
 * Run: npx tsx index.ts
 */

import express from 'express';
import { tollwayMiddleware } from '@tollway/server';
import type { AgentIdentity } from '@tollway/server';

const app = express();

// One line to enable Tollway on your site
app.use(
  tollwayMiddleware({
    policy: {
      freeRequestsPerDay: 100,
      trainingAllowed: false,
      attributionRequired: true,
      attributionFormat: '{title} — {url}',
      cacheAllowed: true,
      cacheTtlSeconds: 3600,
      requestsPerMinute: 60,
      prohibitedActions: ['scrape_bulk'],
      paymentRequiredActions: ['train'],
      pricing: [{ action: 'train', price: '0.001' }],
    },

    // USDC address on Base for micropayments
    paymentAddress: process.env.PAYMENT_ADDRESS,
    paymentNetwork: 'base',

    enableLogging: true,

    onAgentRequest: (identity: AgentIdentity) => {
      console.log(`[agent] ${identity.did} (${identity.scope}): ${identity.purpose}`);
    },
  }),
);

app.get('/', (_req, res) => {
  // req.tollwayIdentity is set for agent requests
  res.send(`
    <html>
      <head>
        <title>My Tollway-Enabled Site</title>
        <meta property="og:title" content="My Tollway-Enabled Site" />
        <meta property="og:description" content="AI agents get structured data here." />
      </head>
      <body>
        <h1>Hello, World!</h1>
        <p>This site is Tollway-compliant. Check /.well-known/tollway.json for the policy.</p>
      </body>
    </html>
  `);
});

app.listen(3000, () => {
  console.log('Server:  http://localhost:3000');
  console.log('Policy:  http://localhost:3000/.well-known/tollway.json');
});

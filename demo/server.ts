/**
 * Tollway Demo Server
 *
 * A live example of @tollway/server in action.
 * - Serves /.well-known/tollway.json
 * - Validates agent identity headers
 * - Returns 402 for 'train' scope
 * - Serves sample articles with structured metadata
 *
 * Deploy to Railway / Render / Fly with the included Dockerfile.
 */

import express from 'express';
import { tollwayMiddleware } from '@tollway/server';

const app = express();
const PORT = parseInt(process.env.PORT ?? '3000', 10);

// ─── Tollway Middleware ────────────────────────────────────────────────────────

app.use(
  tollwayMiddleware({
    policy: {
      freeRequestsPerDay: 500,
      trainingAllowed: false,
      attributionRequired: true,
      attributionFormat: '{title} via Tollway Demo ({url})',
      cacheAllowed: true,
      cacheTtlSeconds: 3600,
      prohibitedActions: ['scrape_bulk'],
      paymentRequiredActions: ['train'],
      pricing: [
        { action: 'read',      price: '0.001' },
        { action: 'summarize', price: '0.005' },
        { action: 'train',     price: '0.05'  },
      ],
      requestsPerMinute: 30,
      requestsPerDay: 500,
    },
    paymentAddress: process.env.PAYMENT_ADDRESS ?? '0x0000000000000000000000000000000000000000',
    paymentNetwork: 'base-sepolia',
    enableLogging: true,
    onAgentRequest: (identity) => {
      console.log(`[agent] ${identity.did} — ${identity.scope} — ${identity.purpose}`);
    },
  }),
);

// ─── Sample Content ────────────────────────────────────────────────────────────

const ARTICLES: Record<string, { title: string; author: string; date: string; body: string }> = {
  'intro-to-tollway': {
    title: 'Introducing the Tollway Protocol',
    author: 'Tollway Team',
    date: '2026-03-01',
    body: `
The Tollway protocol brings structure to how AI agents access the web.
Just as robots.txt told crawlers what they could read, tollway.json tells
agents what they can do — and how much it costs.

Agents identify themselves with a DID (Decentralized Identifier) and sign
every request with an Ed25519 key. Sites respond with policies covering
training permissions, pricing, attribution requirements, and rate limits.

When a resource requires payment, the server returns HTTP 402 with
payment details. The agent pays in USDC on Base and retries.
    `.trim(),
  },
  'agent-identity': {
    title: 'Agent Identity in the Agentic Web',
    author: 'Tollway Research',
    date: '2026-03-05',
    body: `
Today's AI agents browse the web pseudonymously. They present no identity,
accept no responsibility, and operate entirely in the shadows of user-agents.

The agentic web needs something better: a lightweight identity layer that
lets agents announce who they are, what they want, and who they work for —
without requiring central registries or heavyweight authentication flows.

The Tollway DID approach uses the W3C did:key method with Ed25519 keypairs.
Every agent generates a keypair; the public key becomes the DID. Requests
are signed so servers can verify the agent hasn't been spoofed.
    `.trim(),
  },
  'x402-micropayments': {
    title: 'x402: HTTP Payments for the Machine Economy',
    author: 'Tollway Engineering',
    date: '2026-03-08',
    body: `
HTTP 402 Payment Required has been a reserved status code since 1991,
waiting for its moment. That moment is now.

The x402 standard (being standardized by Coinbase and others) defines how
servers express payment requirements and how clients fulfill them. Tollway
builds on x402 with USDC on Base for fast, cheap, auditable micropayments.

An agent that wants to train on content sends a signed request. The server
responds with 402 and a payment address. The agent sends USDC on-chain and
includes the transaction hash in a retry. The server verifies and responds.
    `.trim(),
  },
};

// ─── Routes ───────────────────────────────────────────────────────────────────

app.get('/', (_req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tollway Demo</title>
  <meta name="description" content="Live demo of the Tollway protocol — robots.txt rebuilt for the agentic era">
  <meta property="og:title" content="Tollway Demo">
  <meta property="og:description" content="Live demo of the Tollway protocol — robots.txt rebuilt for the agentic era">
</head>
<body>
  <h1>Tollway Protocol — Live Demo</h1>
  <p>This server demonstrates the <a href="https://tollway.dev">Tollway protocol</a>.</p>
  <h2>Try it</h2>
  <pre>npx @tollway/cli fetch ${process.env.PUBLIC_URL ?? 'http://localhost:3000'}/articles/intro-to-tollway</pre>
  <h2>Articles</h2>
  <ul>
    ${Object.keys(ARTICLES).map(slug => `<li><a href="/articles/${slug}">${ARTICLES[slug].title}</a></li>`).join('\n    ')}
  </ul>
  <h2>Policy</h2>
  <p>See <a href="/.well-known/tollway.json">/.well-known/tollway.json</a></p>
</body>
</html>`);
});

app.get('/articles/:slug', (req, res) => {
  const article = ARTICLES[req.params.slug];
  if (!article) {
    return res.status(404).json({ error: 'Article not found' });
  }

  const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;

  res.setHeader('Content-Type', 'text/html');
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${article.title}</title>
  <meta name="description" content="${article.body.slice(0, 150).replace(/\n/g, ' ')}">
  <meta property="og:title" content="${article.title}">
  <meta property="og:description" content="${article.body.slice(0, 150).replace(/\n/g, ' ')}">
  <link rel="canonical" href="${url}">
</head>
<body>
  <article>
    <h1>${article.title}</h1>
    <p><em>By ${article.author} — ${article.date}</em></p>
    <div>${article.body.split('\n').map(p => `<p>${p}</p>`).join('\n    ')}</div>
  </article>
  <footer>
    <p>Content served via <a href="https://tollway.dev">Tollway</a></p>
  </footer>
</body>
</html>`);
});

app.get('/articles', (_req, res) => {
  res.json({
    articles: Object.entries(ARTICLES).map(([slug, a]) => ({
      slug,
      title: a.title,
      author: a.author,
      date: a.date,
      url: `/articles/${slug}`,
    })),
  });
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', version: '0.1.0', protocol: 'tollway/0.1' });
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Tollway demo server running on port ${PORT}`);
  console.log(`Policy: http://localhost:${PORT}/.well-known/tollway.json`);
  console.log(`Try:    npx @tollway/cli fetch http://localhost:${PORT}/articles/intro-to-tollway`);
});

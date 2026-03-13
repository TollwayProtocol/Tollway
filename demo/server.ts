/**
 * Tollway Demo Server
 *
 * A live example of @tollway/server in action.
 * - Serves /.well-known/tollway.json
 * - Validates agent identity headers
 * - Returns 402 for 'train' scope
 * - Serves sample articles with structured metadata
 */

import express from 'express';
import { tollwayMiddleware } from '@tollway/server';

const app = express();
const PORT = parseInt(process.env.PORT ?? '3000', 10);
const BASE_URL = process.env.PUBLIC_URL ?? `http://localhost:${PORT}`;

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

// ─── Shared styles ────────────────────────────────────────────────────────────

const CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg: #0a0a0a;
    --bg2: #111111;
    --bg3: #1a1a1a;
    --border: #222222;
    --text: #ededed;
    --muted: #888888;
    --accent: #00d4aa;
    --accent2: #7c6af7;
    --code-bg: #141414;
    --font: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    --mono: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
  }

  html { font-size: 16px; }

  body {
    background: var(--bg);
    color: var(--text);
    font-family: var(--font);
    line-height: 1.6;
    min-height: 100vh;
  }

  a { color: var(--accent); text-decoration: none; }
  a:hover { text-decoration: underline; }

  .container {
    max-width: 780px;
    margin: 0 auto;
    padding: 0 24px;
  }

  /* ── Nav ── */
  nav {
    border-bottom: 1px solid var(--border);
    padding: 16px 0;
  }
  nav .inner {
    max-width: 780px;
    margin: 0 auto;
    padding: 0 24px;
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .nav-logo {
    font-family: var(--mono);
    font-size: 14px;
    font-weight: 600;
    color: var(--text);
    letter-spacing: -0.3px;
  }
  .nav-logo span { color: var(--accent); }
  .nav-badge {
    font-family: var(--mono);
    font-size: 11px;
    color: var(--muted);
    background: var(--bg3);
    border: 1px solid var(--border);
    padding: 2px 8px;
    border-radius: 999px;
  }
  nav .links {
    margin-left: auto;
    display: flex;
    gap: 20px;
  }
  nav .links a {
    font-size: 13px;
    color: var(--muted);
  }
  nav .links a:hover { color: var(--text); text-decoration: none; }

  /* ── Hero ── */
  .hero {
    padding: 72px 0 56px;
    border-bottom: 1px solid var(--border);
  }
  .hero-eyebrow {
    font-family: var(--mono);
    font-size: 12px;
    color: var(--accent);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    margin-bottom: 20px;
  }
  .hero h1 {
    font-size: clamp(28px, 5vw, 44px);
    font-weight: 700;
    line-height: 1.15;
    letter-spacing: -0.03em;
    margin-bottom: 20px;
    color: var(--text);
  }
  .hero h1 em {
    font-style: normal;
    color: var(--accent);
  }
  .hero-sub {
    font-size: 16px;
    color: var(--muted);
    max-width: 560px;
    line-height: 1.7;
    margin-bottom: 36px;
  }
  .hero-cmd {
    display: inline-flex;
    align-items: center;
    gap: 12px;
    background: var(--code-bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 12px 18px;
    font-family: var(--mono);
    font-size: 13px;
    color: var(--text);
  }
  .hero-cmd .prompt { color: var(--accent); user-select: none; }
  .hero-badges {
    margin-top: 32px;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .badge {
    font-family: var(--mono);
    font-size: 11px;
    padding: 4px 10px;
    border-radius: 4px;
    border: 1px solid var(--border);
    color: var(--muted);
    background: var(--bg2);
  }
  .badge.green { color: #4ade80; border-color: #1a3a2a; background: #0d1f16; }
  .badge.purple { color: #a78bfa; border-color: #2a1f3a; background: #140d1f; }
  .badge.blue { color: #60a5fa; border-color: #1a2a3a; background: #0d1620; }

  /* ── Protocol cards ── */
  .protocol-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 1px;
    background: var(--border);
    border: 1px solid var(--border);
    border-radius: 12px;
    overflow: hidden;
    margin: 48px 0;
  }
  .protocol-card {
    background: var(--bg2);
    padding: 24px;
  }
  .protocol-card-icon {
    font-size: 20px;
    margin-bottom: 12px;
  }
  .protocol-card h3 {
    font-size: 14px;
    font-weight: 600;
    margin-bottom: 6px;
    color: var(--text);
  }
  .protocol-card p {
    font-size: 13px;
    color: var(--muted);
    line-height: 1.5;
  }

  /* ── Section ── */
  .section { padding: 48px 0; border-bottom: 1px solid var(--border); }
  .section-label {
    font-family: var(--mono);
    font-size: 11px;
    color: var(--muted);
    letter-spacing: 0.1em;
    text-transform: uppercase;
    margin-bottom: 24px;
  }

  /* ── Articles list ── */
  .article-list { list-style: none; }
  .article-list li {
    border-bottom: 1px solid var(--border);
  }
  .article-list li:last-child { border-bottom: none; }
  .article-list a {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 18px 0;
    color: var(--text);
    font-size: 15px;
    gap: 16px;
  }
  .article-list a:hover { text-decoration: none; color: var(--accent); }
  .article-list .meta { font-size: 12px; color: var(--muted); white-space: nowrap; }
  .article-list .arrow { color: var(--muted); transition: transform 0.15s; }
  .article-list a:hover .arrow { transform: translateX(3px); }

  /* ── Code block ── */
  .code-block {
    background: var(--code-bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 20px;
    font-family: var(--mono);
    font-size: 13px;
    line-height: 1.7;
    overflow-x: auto;
    color: var(--text);
  }
  .code-block .c { color: var(--muted); }
  .code-block .k { color: var(--accent2); }
  .code-block .s { color: #f9a86a; }
  .code-block .p { color: var(--accent); }

  /* ── Article page ── */
  .article-header {
    padding: 56px 0 40px;
    border-bottom: 1px solid var(--border);
  }
  .article-header .tag {
    font-family: var(--mono);
    font-size: 11px;
    color: var(--accent);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    margin-bottom: 16px;
  }
  .article-header h1 {
    font-size: clamp(22px, 4vw, 34px);
    font-weight: 700;
    letter-spacing: -0.02em;
    line-height: 1.2;
    margin-bottom: 16px;
  }
  .article-header .byline {
    font-size: 13px;
    color: var(--muted);
  }
  .article-body {
    padding: 40px 0;
    border-bottom: 1px solid var(--border);
  }
  .article-body p {
    font-size: 16px;
    line-height: 1.8;
    color: #c8c8c8;
    margin-bottom: 20px;
    max-width: 660px;
  }
  .article-footer {
    padding: 24px 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .article-footer .attribution {
    font-family: var(--mono);
    font-size: 11px;
    color: var(--muted);
  }

  /* ── Policy box ── */
  .policy-box {
    background: var(--bg2);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 20px 24px;
  }
  .policy-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 0;
    border-bottom: 1px solid var(--border);
    font-size: 13px;
  }
  .policy-row:last-child { border-bottom: none; }
  .policy-row .key { color: var(--muted); font-family: var(--mono); }
  .policy-row .val { color: var(--text); }
  .policy-row .val.red { color: #f87171; }
  .policy-row .val.green { color: #4ade80; }

  /* ── Footer ── */
  footer {
    padding: 32px 0;
    text-align: center;
  }
  footer p {
    font-size: 12px;
    color: #444;
    font-family: var(--mono);
  }
  footer a { color: #555; }
  footer a:hover { color: var(--muted); }

  /* ── Mobile ── */
  @media (max-width: 640px) {
    .container { padding: 0 16px; }
    nav .inner { padding: 0 16px; gap: 8px; }
    .nav-badge { display: none; }
    nav .links { gap: 12px; }
    nav .links a { font-size: 12px; }

    .hero { padding: 48px 0 40px; }
    .hero-cmd {
      display: flex;
      max-width: 100%;
      overflow-x: auto;
      white-space: nowrap;
      font-size: 12px;
      padding: 10px 14px;
    }

    .protocol-grid { grid-template-columns: 1fr; }

    .article-list a { font-size: 14px; gap: 8px; }
    .article-list .meta { display: none; }

    .article-header { padding: 40px 0 28px; }

    .article-footer {
      flex-direction: column;
      align-items: flex-start;
      gap: 8px;
    }

    .policy-row {
      flex-direction: column;
      align-items: flex-start;
      gap: 4px;
      padding: 12px 0;
    }
    .policy-row .val { font-size: 13px; }

    .section { padding: 32px 0; }
  }
`;

const NAV = `
<nav>
  <div class="inner">
    <span class="nav-logo">tollway<span>.</span>dev</span>
    <span class="nav-badge">live demo</span>
    <div class="links">
      <a href="/policy">policy</a>
      <a href="/articles">articles</a>
      <a href="https://github.com/TollwayProtocol/Tollway" target="_blank">github</a>
      <a href="https://www.npmjs.com/org/tollway" target="_blank">npm</a>
    </div>
  </div>
</nav>`;

const FOOTER = `
<footer>
  <div class="container">
    <p>
      <a href="https://github.com/TollwayProtocol/Tollway" target="_blank">open source</a>
      &nbsp;·&nbsp;
      <a href="https://tollway.dev" target="_blank">tollway.dev</a>
      &nbsp;·&nbsp;
      spec: CC BY 4.0 &nbsp;·&nbsp; code: MIT
    </p>
  </div>
</footer>`;

function page(title: string, body: string, description = 'Live demo of the Tollway protocol — robots.txt rebuilt for the agentic era'): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <meta name="description" content="${description}">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:type" content="website">
  <style>${CSS}</style>
</head>
<body>
${NAV}
${body}
${FOOTER}
</body>
</html>`;
}

// ─── Sample Content ────────────────────────────────────────────────────────────

const ARTICLES: Record<string, { title: string; author: string; date: string; body: string }> = {
  'intro-to-tollway': {
    title: 'Introducing the Tollway Protocol',
    author: 'Tollway Team',
    date: '2026-03-01',
    body: `The Tollway protocol brings structure to how AI agents access the web. Just as robots.txt told crawlers what they could read, tollway.json tells agents what they can do — and how much it costs.

Agents identify themselves with a DID (Decentralized Identifier) and sign every request with an Ed25519 key. Sites respond with policies covering training permissions, pricing, attribution requirements, and rate limits.

When a resource requires payment, the server returns HTTP 402 with payment details. The agent pays in USDC on Base and retries with a transaction receipt. The whole flow happens in milliseconds.`,
  },
  'agent-identity': {
    title: 'Agent Identity in the Agentic Web',
    author: 'Tollway Research',
    date: '2026-03-05',
    body: `Today's AI agents browse the web pseudonymously. They present no identity, accept no responsibility, and operate entirely in the shadows of user-agents.

The agentic web needs something better: a lightweight identity layer that lets agents announce who they are, what they want, and who they work for — without requiring central registries or heavyweight authentication flows.

The Tollway DID approach uses the W3C did:key method with Ed25519 keypairs. Every agent generates a keypair locally; the public key becomes the DID. Requests are signed so servers can verify the agent is who they claim to be.`,
  },
  'x402-micropayments': {
    title: 'x402: HTTP Payments for the Machine Economy',
    author: 'Tollway Engineering',
    date: '2026-03-08',
    body: `HTTP 402 Payment Required has been a reserved status code since 1991, waiting for its moment. That moment is now.

The x402 standard (being developed by Coinbase and the broader web3 community) defines how servers express payment requirements and how clients fulfill them. Tollway builds on x402 with USDC on Base for fast, cheap, and auditable micropayments.

An agent that wants to train on content sends a signed request. The server responds with 402 and a payment address. The agent sends USDC on-chain and includes the transaction hash in a retry. The server verifies and responds with the content.`,
  },
};

// ─── Routes ───────────────────────────────────────────────────────────────────

app.get('/', (req, res) => {
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  const articleItems = Object.entries(ARTICLES).map(([slug, a]) => `
    <li>
      <a href="/articles/${slug}">
        <span>${a.title}</span>
        <span style="display:flex;align-items:center;gap:12px">
          <span class="meta">${a.date}</span>
          <span class="arrow">→</span>
        </span>
      </a>
    </li>`).join('');

  res.setHeader('Content-Type', 'text/html');
  res.send(page('Tollway — Live Demo', `
  <div class="container">
    <div class="hero">
      <div class="hero-eyebrow">● live demo server</div>
      <h1>robots.txt rebuilt<br>for the <em>agentic era</em></h1>
      <p class="hero-sub">
        Tollway is an open protocol for AI agent web access.
        Identity headers, policy enforcement, and USDC micropayments —
        all in a single middleware you drop into any Express or Next.js app.
      </p>
      <div class="hero-cmd">
        <span class="prompt">$</span>
        <span>npx @tollway/cli fetch ${baseUrl}/articles/intro-to-tollway</span>
      </div>
      <div class="hero-badges">
        <span class="badge green">✓ tollway.json served</span>
        <span class="badge purple">✓ DID identity headers</span>
        <span class="badge blue">✓ 402 payment flow</span>
        <span class="badge">Ed25519 signing</span>
        <span class="badge">USDC on Base</span>
        <span class="badge">MIT + CC BY 4.0</span>
      </div>
    </div>

    <div class="protocol-grid">
      <div class="protocol-card">
        <div class="protocol-card-icon">◈</div>
        <h3>Identity</h3>
        <p>Every agent request carries a <code style="font-family:var(--mono);font-size:11px;color:var(--accent)">did:key</code> DID and an Ed25519 signature. Servers know who is asking.</p>
      </div>
      <div class="protocol-card">
        <div class="protocol-card-icon">◎</div>
        <h3>Policy</h3>
        <p>Sites publish <code style="font-family:var(--mono);font-size:11px;color:var(--accent)">/.well-known/tollway.json</code> declaring what agents can do, how much it costs, and attribution rules.</p>
      </div>
      <div class="protocol-card">
        <div class="protocol-card-icon">◐</div>
        <h3>Payments</h3>
        <p>HTTP 402 + x402 standard. Agents pay in USDC on Base. The whole round-trip happens in milliseconds.</p>
      </div>
    </div>

    <div class="section">
      <div class="section-label">sample content</div>
      <ul class="article-list">${articleItems}</ul>
    </div>

    <div class="section">
      <div class="section-label">this server's policy</div>
      <div class="policy-box">
        <div class="policy-row"><span class="key">training_allowed</span><span class="val red">false</span></div>
        <div class="policy-row"><span class="key">attribution_required</span><span class="val green">true</span></div>
        <div class="policy-row"><span class="key">free_requests_per_day</span><span class="val">500</span></div>
        <div class="policy-row"><span class="key">read</span><span class="val">0.001 USDC</span></div>
        <div class="policy-row"><span class="key">summarize</span><span class="val">0.005 USDC</span></div>
        <div class="policy-row"><span class="key">train</span><span class="val">0.05 USDC (402)</span></div>
        <div class="policy-row"><span class="key">network</span><span class="val">Base Sepolia</span></div>
      </div>
      <p style="margin-top:12px;font-size:12px;color:var(--muted)">
        Full policy at <a href="/.well-known/tollway.json">/.well-known/tollway.json</a>
      </p>
    </div>

    <div class="section">
      <div class="section-label">integrate in 3 lines</div>
      <div class="code-block"><span class="k">import</span> { tollwayMiddleware } <span class="k">from</span> <span class="s">'@tollway/server'</span>;

app.<span class="p">use</span>(tollwayMiddleware({
  policy: { trainingAllowed: <span class="k">false</span>, freeRequestsPerDay: <span class="s">100</span> },
  paymentAddress: process.env.<span class="s">PAYMENT_ADDRESS</span>,
}));</div>
    </div>
  </div>`));
});

app.get('/articles', (_req, res) => {
  const items = Object.entries(ARTICLES).map(([slug, a]) => `
    <li>
      <a href="/articles/${slug}">
        <span>${a.title}</span>
        <span style="display:flex;align-items:center;gap:12px">
          <span class="meta">${a.author} &nbsp;·&nbsp; ${a.date}</span>
          <span class="arrow">→</span>
        </span>
      </a>
    </li>`).join('');

  res.setHeader('Content-Type', 'text/html');
  res.send(page('Articles — Tollway Demo', `
  <div class="container">
    <div class="article-header">
      <div class="tag">● tollway demo · content</div>
      <h1>Sample Articles</h1>
      <div class="byline">Three articles guarded at different protocol conformance levels</div>
    </div>
    <div class="article-body" style="padding-top:8px">
      <div style="display:grid;gap:12px;margin-bottom:32px">
        <div style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:16px 20px;display:flex;align-items:center;gap:12px">
          <span style="font-family:var(--mono);font-size:11px;color:#4ade80;background:#0d1f16;border:1px solid #1a3a2a;padding:3px 8px;border-radius:4px">Basic</span>
          <span style="font-size:13px;color:var(--muted)">intro-to-tollway — freely accessible, no headers required</span>
        </div>
        <div style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:16px 20px;display:flex;align-items:center;gap:12px">
          <span style="font-family:var(--mono);font-size:11px;color:#60a5fa;background:#0d1620;border:1px solid #1a2a3a;padding:3px 8px;border-radius:4px">Identity</span>
          <span style="font-size:13px;color:var(--muted)">agent-identity — requires valid <code style="font-family:var(--mono);font-size:11px">X-Tollway-*</code> headers</span>
        </div>
        <div style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:16px 20px;display:flex;align-items:center;gap:12px">
          <span style="font-family:var(--mono);font-size:11px;color:#a78bfa;background:#140d1f;border:1px solid #2a1f3a;padding:3px 8px;border-radius:4px">Payment</span>
          <span style="font-size:13px;color:var(--muted)">x402-micropayments — returns 402 for <code style="font-family:var(--mono);font-size:11px">train</code> scope, 0.05 USDC</span>
        </div>
      </div>
      <ul class="article-list">${items}</ul>
    </div>
    <div class="article-footer">
      <a href="/">← back to demo</a>
      <span class="attribution">machine-readable: <a href="/articles" style="color:var(--muted)" onclick="event.preventDefault();fetch('/articles',{headers:{accept:'application/json'}}).then(r=>r.json()).then(d=>alert(JSON.stringify(d,null,2)))">view JSON</a></span>
    </div>
  </div>`));
});

app.get('/articles/:slug', (req, res) => {
  const article = ARTICLES[req.params.slug];
  if (!article) {
    return res.status(404).json({ error: 'Article not found' });
  }

  const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
  const desc = article.body.slice(0, 150).replace(/\n/g, ' ');

  res.setHeader('Content-Type', 'text/html');
  res.send(page(article.title, `
  <div class="container">
    <div class="article-header">
      <div class="tag">● tollway demo · article</div>
      <h1>${article.title}</h1>
      <div class="byline">${article.author} &nbsp;·&nbsp; ${article.date}</div>
    </div>
    <div class="article-body">
      ${article.body.split('\n\n').map(p => `<p>${p.trim()}</p>`).join('\n      ')}
    </div>
    <div class="article-footer">
      <span class="attribution">
        <a href="/">← tollway demo</a>
      </span>
      <span class="attribution">
        Attribution: ${article.title} via Tollway Demo
      </span>
    </div>
  </div>`, desc, ));
});

app.get('/policy', (_req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(page('Policy — Tollway Demo', `
  <div class="container">
    <div class="article-header">
      <div class="tag">● tollway demo · policy</div>
      <h1>Access Policy</h1>
      <div class="byline">What AI agents are allowed to do on this server</div>
    </div>
    <div class="article-body">
      <p>This server publishes a machine-readable policy at <a href="/.well-known/tollway.json"><code style="font-family:var(--mono);font-size:13px">/.well-known/tollway.json</code></a>. Tollway-compatible agents read this automatically before making requests.</p>

      <div style="margin:32px 0">
        <div class="section-label">actions</div>
        <div class="policy-box">
          <div class="policy-row"><span class="key">read, search, summarize</span><span class="val green">✓ allowed</span></div>
          <div class="policy-row"><span class="key">scrape_bulk</span><span class="val red">✗ prohibited — returns 403</span></div>
          <div class="policy-row"><span class="key">train</span><span class="val" style="color:#f9a86a">⚡ requires payment — returns 402</span></div>
        </div>
      </div>

      <div style="margin:32px 0">
        <div class="section-label">pricing</div>
        <div class="policy-box">
          <div class="policy-row"><span class="key">currency</span><span class="val">USDC on Base Sepolia</span></div>
          <div class="policy-row"><span class="key">free requests / day</span><span class="val">500</span></div>
          <div class="policy-row"><span class="key">read</span><span class="val">0.001 USDC</span></div>
          <div class="policy-row"><span class="key">summarize</span><span class="val">0.005 USDC</span></div>
          <div class="policy-row"><span class="key">train</span><span class="val">0.05 USDC</span></div>
        </div>
      </div>

      <div style="margin:32px 0">
        <div class="section-label">data rules</div>
        <div class="policy-box">
          <div class="policy-row"><span class="key">training_allowed</span><span class="val red">false</span></div>
          <div class="policy-row"><span class="key">attribution_required</span><span class="val green">true</span></div>
          <div class="policy-row"><span class="key">attribution_format</span><span class="val" style="font-family:var(--mono);font-size:12px">{title} via Tollway Demo ({url})</span></div>
          <div class="policy-row"><span class="key">cache_allowed</span><span class="val green">true</span></div>
          <div class="policy-row"><span class="key">cache_ttl</span><span class="val">1 hour</span></div>
        </div>
      </div>

      <div style="margin:32px 0">
        <div class="section-label">rate limits</div>
        <div class="policy-box">
          <div class="policy-row"><span class="key">requests / minute</span><span class="val">30</span></div>
          <div class="policy-row"><span class="key">requests / day</span><span class="val">500</span></div>
        </div>
      </div>

      <p style="margin-top:8px">Machine-readable version: <a href="/.well-known/tollway.json">/.well-known/tollway.json</a></p>
    </div>
    <div class="article-footer">
      <a href="/">← back to demo</a>
    </div>
  </div>`));
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', version: '0.2.0', protocol: 'tollway/0.1' });
});

// ─── Start ────────────────────────────────────────────────────────────────────

export default app;

if (process.env.VERCEL !== '1') {
  app.listen(PORT, () => {
    console.log(`Tollway demo server running on port ${PORT}`);
    console.log(`Policy: http://localhost:${PORT}/.well-known/tollway.json`);
    console.log(`Try:    npx @tollway/cli fetch http://localhost:${PORT}/articles/intro-to-tollway`);
  });
}

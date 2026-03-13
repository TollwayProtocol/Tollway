# Hacker News Launch Post

## Title
**Show HN: Tollway – robots.txt rebuilt for the agentic era (Ed25519 identity + HTTP 402 micropayments)**

---

## Body

AI agents are browsing the web at scale. They do it with no identity, no accountability, and no mechanism to compensate the publishers they extract value from.

`robots.txt` was written in 1994 for crawlers that voluntarily respect conventions. It has no authentication, no payment layer, and no way to tell a research assistant from a bulk scraper.

**Tollway** is an open protocol that adds three things over standard HTTP:

1. **Identity** — Agents sign every request with an Ed25519 keypair. The signature covers the DID, purpose, scope, nonce, timestamp, method, and URL — a tamper-evident chain of custody for every access.

2. **Policy** — Sites publish `/.well-known/tollway.json` declaring what agents can do, rate limits, pricing, and data use rules (training allowed? attribution required? caching TTL?).

3. **Payments** — When content requires it, the server returns HTTP 402 with a USDC price and a payment address on Base. The agent pays on-chain and retries with a receipt. No accounts, no API keys, no billing dashboards.

---

**What's built so far:**

- [`@tollway/client`](https://npmjs.com/package/@tollway/client) — TypeScript agent client with automatic 402 handling and Ed25519 signing
- [`@tollway/server`](https://npmjs.com/package/@tollway/server) — Express/Next.js middleware: validates signatures, enforces policy, emits 402s
- [`@tollway/cli`](https://npmjs.com/package/@tollway/cli) — `tollway init` generates your DID keypair; `tollway fetch` makes signed requests from the terminal
- [`@tollway/payments`](https://npmjs.com/package/@tollway/payments) — viem-based USDC handler for Base mainnet + Sepolia
- `tollway-server` (PyPI) — Flask and FastAPI middleware with PyNaCl signature verification
- A [formal spec](https://github.com/TollwayProtocol/Tollway/blob/main/SPEC.md) covering conformance levels, error codes, security considerations

**Live demo:** [demo.tollway.dev](https://demo.tollway.dev) — three articles, each guarded at a different conformance level. You can run `tollway fetch` against it directly.

---

**Why on-chain payments instead of API keys?**

The whole point is that the agent and the site don't need a prior relationship. An agent can walk up to any Tollway-compliant endpoint cold, read the policy, pay the exact price, and get access — without either party needing to register anywhere. That requires a permissionless payment rail. USDC on Base settles in ~2 seconds and costs fractions of a cent in gas.

---

**What I'm looking for:**

- **Protocol feedback** — Is the canonical string format right? Should the scope list be extensible or fixed? Is 5-minute timestamp skew the right window?
- **Implementation feedback** — Any footguns in the TypeScript or Python libraries?
- **Use cases I haven't thought of** — I've been focused on content access and training data. Are there other agent interaction patterns this should cover?
- **People who want to contribute** — The spec is CC BY 4.0, the code is MIT. Everything is in the open.

Spec: https://github.com/TollwayProtocol/Tollway/blob/main/SPEC.md
Repo: https://github.com/TollwayProtocol/Tollway

---

## Comment Prep (anticipate top questions)

**"Why not just use OAuth / existing auth standards?"**
OAuth requires a prior registration relationship. An agent fetching content from a random publisher it's never interacted with before can't OAuth. DIDs + Ed25519 are self-sovereign — you generate your identity offline, no issuer needed.

**"Publishers will just ignore this like they ignore robots.txt"**
Two differences: (1) there's a payment incentive — if you enforce Tollway you can monetize agent access instead of just blocking it. (2) Signature verification is cryptographic enforcement, not a convention. An agent that forges a DID will have its signature fail.

**"Isn't x402 already doing this?"**
x402 (Coinbase) handles the payment layer. Tollway uses x402-compatible 402 responses but adds the identity + policy layers on top. They're complementary — x402 is the payment rail, Tollway is the full access-control protocol.

**"What about agents that just don't send Tollway headers?"**
Sites can choose to reject unsigned requests entirely (`require_did: true` in policy) or serve degraded responses. The protocol doesn't fix bad-faith actors — it gives good-faith actors a way to identify themselves and pay, and gives sites tools to distinguish them.

**"USDC on Base feels niche"**
It's the lowest-friction permissionless stablecoin rail that exists today. The protocol doesn't technically prohibit other payment networks — `payment_network` in the 402 response is a string. Base/USDC is the reference implementation.

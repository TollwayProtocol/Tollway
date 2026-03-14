# Hacker News Launch Post

## Title
**Show HN: Tollway – open protocol for AI agent identity and web access policy**

---

## Body

AI agents are browsing the web at scale. Every one of them is anonymous.

From a site's perspective, an agent doing legitimate research looks identical to a scraper stripping content for a competing product, a bot stress-testing their infrastructure, or a crawler building a training dataset without permission. So sites do the only rational thing: block all of it, or rate-limit it into uselessness. Agents respond by rotating IPs and spoofing user-agents. Everyone loses.

**Tollway** is an open protocol that gives agents an identity they can stand behind. Two pieces:

**1. Identity** — Agents sign every request with an Ed25519 keypair tied to a `did:key` DID. The signature covers the DID, declared purpose, scope, nonce, timestamp, method, and URL. No central registry, no issuer — you generate your keypair offline and the public key is embedded in the DID itself.

**2. Policy** — Sites publish `/.well-known/tollway.json` declaring what agents can do: allowed/prohibited actions, rate limits, attribution requirements, caching rules, data-use policy (training allowed?). The site middleware verifies signatures, enforces nonces and timestamps, and logs structured agent traffic.

That's the core. A site that adds the middleware knows exactly which agent is making each request and can make real decisions instead of blanket blocks. An agent that sends identity headers gets treated as a named entity with a track record instead of anonymous traffic.

**There's also an optional payment layer** — sites can return HTTP 402 with a USDC price on Base. The agent pays on-chain and retries with a receipt. No accounts, no billing dashboards. Worth enabling once you have agents you trust and content worth charging for, but deliberately not the entry point.

---

**What's built:**

- [`@tollway/client`](https://npmjs.com/package/@tollway/client) — TypeScript drop-in fetch replacement. Attaches identity headers, reads `tollway.json`, handles schema-based structured extraction and optional 402 flows
- [`@tollway/server`](https://npmjs.com/package/@tollway/server) — Express/Next.js middleware: verifies signatures, enforces policy, logs agent traffic
- [`@tollway/cli`](https://npmjs.com/package/@tollway/cli) — `tollway init` generates your DID keypair in 2 seconds; `tollway fetch` makes signed requests from the terminal
- [`@tollway/langchain`](https://npmjs.com/package/@tollway/langchain) + [`@tollway/llamaindex`](https://npmjs.com/package/@tollway/llamaindex) — framework integrations so agents in existing pipelines get identity for free
- [`@tollway/reputation`](https://npmjs.com/package/@tollway/reputation) — reference reputation oracle: servers record observations, agents build a score over time
- `tollway-server` (PyPI) — Flask and FastAPI middleware, same protocol semantics
- `/schemas` — community-maintained CSS extraction schemas for 10+ sites (arXiv, GitHub, Wikipedia, Stack Overflow, PubMed...) — clean structured JSON without LLM calls
- A [formal spec](https://github.com/TollwayProtocol/Tollway/blob/main/SPEC.md) with conformance levels so you can adopt incrementally

**Live demo:** [demo.tollway.dev](https://demo.tollway.dev) — run `tollway fetch https://demo.tollway.dev/articles/1` to see it end to end.

---

**What I'm looking for:**

- **Is the identity layer enough of a hook?** The bet is that sites will add the middleware just to get structured agent logs — knowing who's hitting them, with what purpose and scope — before there's any payment incentive. Does that hold up?
- **Protocol feedback** — canonical string format, scope extensibility, timestamp skew window
- **Cold-start ideas** — what's the minimum viable deployment that makes the identity layer valuable on day one for a site with no Tollway-using agents yet?
- **Contributions** — spec is CC BY 4.0, code is MIT. Go SDK, Ruby SDK, more schemas all welcome

Spec: https://github.com/TollwayProtocol/Tollway/blob/main/SPEC.md
Repo: https://github.com/TollwayProtocol/Tollway

---

## Comment Prep (anticipate top questions)

**"Why not just use OAuth / existing auth standards?"**
OAuth requires a prior registration relationship. An agent fetching content from a site it's never interacted with before can't OAuth. DIDs + Ed25519 are self-sovereign — you generate your identity offline, no issuer needed, works cold.

**"Publishers will just ignore this like they ignore robots.txt"**
robots.txt asks sites to trust conventions with no verification. Tollway gives sites something useful immediately: structured logs of which agents are accessing them, with declared purpose and scope. That has value independent of whether payments ever get enabled.

**"What about agents that just don't send Tollway headers?"**
Sites can require identity (`require_did: true`) or serve degraded responses to unsigned requests. The protocol doesn't fix bad-faith actors — it gives good-faith actors a way to identify themselves and gives sites tools to reward them.

**"Isn't x402 already doing this?"**
x402 handles the payment rail. Tollway uses x402-compatible 402 responses but the identity + policy layers are independent of payments entirely. Most deployments won't touch 402 at first.

**"USDC on Base feels niche"**
The payments layer is opt-in and not the pitch. Identity and policy work without a wallet anywhere in the picture.

**"Why not HTTP Message Signatures (RFC 9421)?"**
RFC 9421 is the right standard for general HTTP signing but it doesn't specify agent identity semantics, policy files, or scope declarations. Tollway is opinionated about the agent-specific use case and designed for zero-config adoption (`tollway init` → keypair in 2 seconds).

**"What's the adoption path? Classic two-sided market problem."**
Honest answer: it is. The bet is that the identity layer has one-sided value first — agent developers adopt it because signed requests get better treatment even on sites that don't fully speak Tollway (less rate limiting, better reputation). Sites adopt it because structured agent logs are useful regardless of payments. Neither side needs the other to be at critical mass to get something out of day one.

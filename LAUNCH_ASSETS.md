# Tollway Launch Assets

---

## 1. Hacker News — Show HN Post

**Title:**
Show HN: Tollway – open protocol for how AI agents access the web (robots.txt for the agentic era)

**Body:**
```
AI agents now make 300% more web requests than a year ago, yet there's no standard for how they 
should identify themselves, request permission, or compensate publishers.

The result: 80%+ of Cloudflare customers block AI bots, OpenAI's scrape-to-referral ratio is 
~1,700:1, and 336% more sites are actively blocking AI crawlers. Both sides are losing.

Tollway is an attempt to make the relationship cooperative.

The protocol has three parts:

1. tollway.json — a file at /.well-known/tollway.json where sites declare policy, pricing, and 
   data rules (like robots.txt but with economics)

2. Identity headers — agents attach X-Tollway-DID, X-Tollway-Purpose, X-Tollway-Scope, and 
   a cryptographic signature to every request

3. Payment flow — HTTP 402 + x402 for USDC micropayments when free tier is exhausted

The key design decision: a translator layer that works against any site on day one, without 
any site adoption needed. Agent developers get immediate value; site adoption follows the 
economic incentive.

We're not trying to be Cloudflare or a platform. We want to be the open standard that 
implementations build on top of — the same way OAuth didn't replace authentication providers, 
it gave them a common interface.

Today we're releasing:
- SPEC.md (full v0.1 protocol specification)
- tollway-client: npm package, drop-in fetch replacement for agents
- tollway-server: Express/Next.js middleware for sites
- 10 extraction schemas for popular sites

GitHub: github.com/tollway-protocol/tollway
Spec: tollway.dev/spec

Looking for early adopters on both sides. If you run an agent-heavy workflow or a 
content site with bot traffic problems, I'd love to talk.
```

---

## 2. Reddit — r/MachineLearning + r/webdev + r/artificial

**Title:** Tollway: open protocol proposal for AI agent web access (identity + policy + micropayments)

**Body:**
```
Been thinking about a problem that's getting worse fast: AI agents have no standard way to 
identify themselves to websites, declare their intent, or pay for access.

The current outcome: sites block everything (80%+ of Cloudflare customers now block AI bots), 
agents scrape anyway ignoring robots.txt (13% of AI crawlers currently ignore it), and 
nobody wins.

I put together a protocol spec that tries to solve this with three layers:

**tollway.json** — sites publish policy at /.well-known/tollway.json. What's allowed, what costs 
money, whether training is permitted. Like robots.txt but machine-readable and economically-aware.

**Identity headers** — agents attach a DID (decentralized identifier), purpose, scope, and 
cryptographic signature. Sites can verify who's knocking and why.

**Payment via HTTP 402 + x402** — when free tier runs out, site returns a price, agent pays 
in USDC on Base, retries with proof.

The thing that makes it immediately useful: a translator layer that extracts structured data 
from ANY site using CSS selector schemas, regardless of whether that site has adopted the 
protocol. Agents get value day one. Site adoption follows the revenue incentive.

This isn't trying to be a platform — it's trying to be the open standard (like OAuth, like 
robots.txt) that platforms and implementations build on.

Spec and reference implementations: github.com/tollway-protocol/tollway

Would love feedback especially on: the identity header design, whether x402/USDC is the right 
payment rail, and what sites/use cases would be most valuable to target first.
```

---

## 3. Twitter/X Thread

**Tweet 1:**
```
AI agents make 300% more web requests than a year ago.

There's still no standard for how they should identify themselves, ask permission, or pay for access.

80%+ of Cloudflare customers now block AI bots. Both sides are losing.

We built Tollway to fix this. 🧵
```

**Tweet 2:**
```
Tollway is three things:

1. tollway.json — sites publish machine-readable policy at /.well-known/tollway.json
   (think robots.txt but with pricing and data rules)

2. Identity headers — agents attach a DID + cryptographic signature to every request

3. HTTP 402 payment flow — agents pay in USDC when free tier runs out
```

**Tweet 3:**
```
The key design decision:

A translator layer that works against ANY site on day one.

CSS selector schemas → structured JSON extraction without LLM calls.
LLM fallback for everything else.

Agent developers get immediate value. Site adoption follows the economic incentive.
```

**Tweet 4:**
```
Today we're releasing:

📄 SPEC.md — full v0.1 protocol spec
📦 tollway-client — drop-in fetch replacement for agents
🖥️ tollway-server — Express/Next.js middleware
📊 10 extraction schemas for popular sites

github.com/tollway-protocol/tollway
```

**Tweet 5:**
```
We're NOT trying to be a platform.

Cloudflare, Tollbit, others are building implementations.

We want to be the open standard they build on — the way OAuth didn't replace 
auth providers, it gave them a common interface.

Looking for early adopters on both sides. DMs open.
```

---

## 4. Founding Contributor Outreach DM

**Subject (if email):** Want to help shape the open standard for AI agent web access?

**Message:**
```
Hey [name],

I've been following your work on [LangChain / agent tooling / web scraping] — specifically 
[specific thing they built or wrote].

I'm working on an open protocol called Tollway that tries to solve a problem I think you've 
probably hit: there's no standard for how AI agents should identify themselves, request 
permission, or pay for content when accessing the open web.

Currently:
- 80%+ of Cloudflare customers block AI bots
- 13% of AI crawlers ignore robots.txt entirely  
- OpenAI's scrape-to-referral ratio is ~1,700:1

Tollway proposes three layers: a tollway.json policy file (like robots.txt with economics), 
cryptographic identity headers, and a 402 payment flow using x402/USDC.

I'm looking for 3-5 founding contributors who want to help shape the spec before it gets 
locked in. The goal is eventually to get this into IETF or W3C as a genuine open standard — 
not a company protocol.

The reference implementation is at github.com/tollway-protocol/tollway. Happy to jump on a 
call if you want to talk through the design.

Is this something you'd be interested in?

[Your name]
```

---

## 5. Launch Day Checklist

### Before launch (T-24h):
- [ ] GitHub repo is public with README, SPEC.md, CONTRIBUTING.md, GOVERNANCE.md
- [ ] npm packages published (tollway-client, tollway-server)
- [ ] tollway.dev landing page live
- [ ] Discord server created with #general, #spec-discussion, #schemas, #integrations channels
- [ ] @tollway_dev Twitter account ready
- [ ] 3 founding contributors briefed and ready to comment

### Launch day (Tuesday or Wednesday, 9am ET):
- [ ] Post Show HN (do not use "we" — write as "I built")
- [ ] Share HN link to founding contributors to engage early
- [ ] Post Reddit threads (r/MachineLearning, r/webdev, r/singularity)
- [ ] Publish Twitter thread
- [ ] Post in LangChain Discord #announcements
- [ ] Post in relevant AI agent Discord servers

### Success metrics (48h):
- [ ] 200+ HN upvotes
- [ ] 100+ GitHub stars
- [ ] 50+ Discord members
- [ ] 1,000+ npm installs
- [ ] 3+ people submitting schema PRs

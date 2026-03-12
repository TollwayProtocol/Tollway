# Contributing to Tollway

Thank you for helping build the open standard for AI agent web access.

## The Highest-Impact Contributions Right Now

1. **Add a schema** for a site you use frequently
2. **Integrate Tollway** into a popular agent framework (LangChain, LlamaIndex, CrewAI)
3. **Adopt tollway.json** on your site and share your experience
4. **Submit an RFC** to improve the spec

---

## Adding a Schema

Schemas are the fastest path to immediate value. Every schema you add means agents get structured data from that site without LLM calls.

1. Copy `/schemas/TEMPLATE.yaml`
2. Rename it to `{domain}.yaml` (e.g. `reuters.yaml`)
3. Inspect the target site's HTML using DevTools
4. Fill in the selectors
5. Test against at least 3 real URLs
6. Submit a PR with the results

**Schema requirements:**
- Must include at least `title` and `content` selectors
- Must include 3+ `test_urls`
- Selectors must work on current site HTML (we run CI against live sites weekly)

---

## Improving the Spec

Spec changes go through the RFC process:

1. Open an issue describing the problem you're solving
2. Fork the repo and create `/rfcs/NNNN-short-title.md` using the RFC template
3. Submit a PR — this opens the 2-week comment period
4. After 2 weeks, a vote among contributors with 3+ merged PRs determines acceptance
5. Accepted RFCs are merged and scheduled for the next spec version

**What makes a good RFC:**
- Clearly states the problem being solved
- Explains why existing spec doesn't address it
- Proposes a concrete, implementable solution
- Considers backwards compatibility

---

## Code Contributions

### Setup

```bash
git clone https://github.com/TollwayProtocol/Tollway.git
cd Tollway
npm install
npm run build
npm test
```

### Monorepo structure

```
packages/tollway-client/   # @tollway/client — drop-in fetch for agents
packages/tollway-server/   # @tollway/server — Express/Next.js middleware
```

### Standards

- TypeScript strict mode
- 100% of public API must have JSDoc
- Tests required for new functionality
- No breaking changes to public API without an RFC

---

## Code of Conduct

Be excellent to each other. This is a technical project. Keep discussion focused on the work.

# @tollway/reputation

Reference reputation oracle for the [Tollway Protocol](https://tollway.dev).

Tracks agent DID reputation scores based on observations submitted by Tollway-enabled servers. Exposes an HTTP API that agents and sites can query to make trust decisions (rate limiting, payment waiving, blocking, etc.).

This is the **reference implementation** using in-memory storage. For production, replace the store with a persistent backend.

## Install & Run

```bash
npx @tollway/reputation
# Oracle running on http://localhost:3100
```

```bash
# With auth and custom port
PORT=4000 ORACLE_API_KEY=your-secret npx @tollway/reputation
```

## API

### `GET /v1/health`
Health check.
```json
{ "status": "ok", "tracked_agents": 42, "timestamp": "2026-03-13T..." }
```

### `GET /v1/:did`
Get reputation for a DID. Returns a neutral score (50) for unknown agents.
```json
{ "did": "did:key:z6Mk...", "score": 78, "observations": 150, "flags": [] }
```

### `POST /v1/:did/observe` _(requires API key)_
Record an observation. Called by Tollway servers after each agent request.
```json
{
  "type": "request_ok",
  "reportedBy": "techcrunch.com",
  "detail": "optional note"
}
```

**Observation types and their score effects:**

| Type | Score Effect |
|---|---|
| `request_ok` | +0.5 |
| `payment_ok` | +2.0 |
| `rate_limit_exceeded` | -5.0 |
| `prohibited_action` | -10.0 |
| `payment_failed` | -8.0 |
| `signature_invalid` | -15.0 |
| `scope_violation` | -7.0 |
| `manual_flag` | -20.0 |

### `GET /v1/:did/history` _(requires API key)_
Full observation history for a DID.

### `GET /v1` _(requires API key)_
List all tracked agents.

## Embed in Your Server

```typescript
import { createOracleApp, ReputationStore } from '@tollway/reputation';

const store = new ReputationStore();
const oracle = createOracleApp({ apiKey: process.env.ORACLE_API_KEY, store });

oracle.listen(3100);

// Record observations programmatically
store.observe('did:key:z6Mk...', {
  type: 'payment_ok',
  reportedBy: 'mysite.com',
});

const summary = store.getSummary('did:key:z6Mk...');
console.log(summary?.score); // 52
```

## Integrate with @tollway/server

Point your Tollway server at this oracle via the `tollwayMiddleware` config:

```typescript
import { tollwayMiddleware } from '@tollway/server';

app.use(tollwayMiddleware({
  policy: {
    identity: {
      minimum_reputation: 30,  // Block agents with score < 30
    },
    // ...
  },
  reputationOracleUrl: 'http://localhost:3100/v1',
}));
```

## Production Notes

The reference implementation stores data in memory — it resets on restart and doesn't scale horizontally. For production:

1. Subclass or replace `ReputationStore` with a Postgres/Redis-backed implementation
2. Add rate limiting to the `/observe` endpoint
3. Consider aggregating from multiple independent oracles before trusting a score
4. The score model (simple additive) is intentionally naive — tune the deltas or replace the scoring logic for your use case

## License

MIT

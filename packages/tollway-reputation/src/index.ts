/**
 * @tollway/reputation
 * Reference reputation oracle for the Tollway protocol.
 *
 * Tracks agent DID reputation scores based on observations submitted by
 * Tollway-enabled servers. Exposes a simple HTTP API that agents and sites
 * can query to make trust decisions.
 *
 * This is a reference implementation using in-memory storage. For production,
 * replace the store with a persistent backend (Postgres, Redis, etc.).
 */

import express, { Request, Response, NextFunction } from 'express';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ObservationType =
  | 'request_ok'           // Normal successful request
  | 'payment_ok'           // Payment completed successfully
  | 'rate_limit_exceeded'  // Agent hit rate limits
  | 'prohibited_action'    // Attempted a prohibited action
  | 'payment_failed'       // Payment flow failed or was rejected
  | 'signature_invalid'    // Request had an invalid signature
  | 'scope_violation'      // Scope used was broader than declared purpose
  | 'manual_flag';         // Manually flagged by a site operator

export interface Observation {
  type: ObservationType;
  reportedBy: string;     // DID or hostname of the reporting server
  timestamp: string;      // ISO 8601
  detail?: string;        // Optional human-readable note
}

export interface ReputationRecord {
  did: string;
  score: number;           // 0–100 (50 = unknown/new agent)
  observations: number;    // Total observations recorded
  flags: string[];         // Active flags that affected score negatively
  firstSeen: string;       // ISO 8601
  lastSeen: string;        // ISO 8601
  history: Observation[];  // Last N observations (capped at MAX_HISTORY)
}

export interface ReputationSummary {
  did: string;
  score: number;
  observations: number;
  flags: string[];
}

// ─── Score Deltas ─────────────────────────────────────────────────────────────

const SCORE_DELTA: Record<ObservationType, number> = {
  request_ok:          +0.5,
  payment_ok:          +2.0,
  rate_limit_exceeded: -5.0,
  prohibited_action:   -10.0,
  payment_failed:      -8.0,
  signature_invalid:   -15.0,
  scope_violation:     -7.0,
  manual_flag:         -20.0,
};

const NEGATIVE_TYPES = new Set<ObservationType>([
  'rate_limit_exceeded',
  'prohibited_action',
  'payment_failed',
  'signature_invalid',
  'scope_violation',
  'manual_flag',
]);

const INITIAL_SCORE = 50;
const MAX_SCORE = 100;
const MIN_SCORE = 0;
const MAX_HISTORY = 100;

// ─── In-Memory Store ──────────────────────────────────────────────────────────

export class ReputationStore {
  private readonly records = new Map<string, ReputationRecord>();

  get(did: string): ReputationRecord | null {
    return this.records.get(did) ?? null;
  }

  getSummary(did: string): ReputationSummary | null {
    const rec = this.records.get(did);
    if (!rec) return null;
    return {
      did: rec.did,
      score: rec.score,
      observations: rec.observations,
      flags: rec.flags,
    };
  }

  observe(did: string, obs: Omit<Observation, 'timestamp'>): ReputationRecord {
    const now = new Date().toISOString();
    const observation: Observation = { ...obs, timestamp: now };

    let rec = this.records.get(did);
    if (!rec) {
      rec = {
        did,
        score: INITIAL_SCORE,
        observations: 0,
        flags: [],
        firstSeen: now,
        lastSeen: now,
        history: [],
      };
    }

    // Apply score delta
    const delta = SCORE_DELTA[obs.type] ?? 0;
    rec.score = Math.max(MIN_SCORE, Math.min(MAX_SCORE, rec.score + delta));

    // Track active flags
    if (NEGATIVE_TYPES.has(obs.type) && !rec.flags.includes(obs.type)) {
      rec.flags.push(obs.type);
    }

    // Update counters and history
    rec.observations++;
    rec.lastSeen = now;
    rec.history.push(observation);
    if (rec.history.length > MAX_HISTORY) {
      rec.history.shift();
    }

    this.records.set(did, rec);
    return rec;
  }

  all(): ReputationSummary[] {
    return Array.from(this.records.values()).map(rec => ({
      did: rec.did,
      score: rec.score,
      observations: rec.observations,
      flags: rec.flags,
    }));
  }

  size(): number {
    return this.records.size;
  }
}

// ─── Express App ──────────────────────────────────────────────────────────────

export interface OracleOptions {
  /** Shared secret required in X-Oracle-Key header for write endpoints */
  apiKey?: string;
  /** Custom store implementation (defaults to in-memory) */
  store?: ReputationStore;
}

export function createOracleApp(options: OracleOptions = {}): express.Application {
  const app = express();
  const store = options.store ?? new ReputationStore();

  app.use(express.json());

  // Auth middleware for write endpoints
  function requireApiKey(req: Request, res: Response, next: NextFunction): void {
    if (!options.apiKey) { next(); return; }
    if (req.headers['x-oracle-key'] !== options.apiKey) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    next();
  }

  /**
   * GET /v1/health
   * Health check — returns oracle stats.
   */
  app.get('/v1/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      tracked_agents: store.size(),
      timestamp: new Date().toISOString(),
    });
  });

  /**
   * GET /v1/:did
   * Get reputation summary for a DID. Returns a 404-like default for unknown agents.
   */
  app.get('/v1/:did', (req: Request, res: Response) => {
    const did = decodeURIComponent(req.params.did);
    const summary = store.getSummary(did);

    if (!summary) {
      // Return a neutral score for unknown agents (don't reveal absence)
      res.json({
        did,
        score: INITIAL_SCORE,
        observations: 0,
        flags: [],
      } satisfies ReputationSummary);
      return;
    }

    res.json(summary);
  });

  /**
   * GET /v1/:did/history
   * Get full observation history for a DID (requires API key).
   */
  app.get('/v1/:did/history', requireApiKey, (req: Request, res: Response) => {
    const did = decodeURIComponent(req.params.did);
    const rec = store.get(did);
    if (!rec) {
      res.status(404).json({ error: 'DID not found' });
      return;
    }
    res.json(rec);
  });

  /**
   * POST /v1/:did/observe
   * Record an observation for a DID.
   *
   * Body: { type: ObservationType, reportedBy: string, detail?: string }
   */
  app.post('/v1/:did/observe', requireApiKey, (req: Request, res: Response) => {
    const did = decodeURIComponent(req.params.did);
    const { type, reportedBy, detail } = req.body as {
      type?: ObservationType;
      reportedBy?: string;
      detail?: string;
    };

    if (!type || !(type in SCORE_DELTA)) {
      res.status(400).json({
        error: 'Invalid observation type',
        valid_types: Object.keys(SCORE_DELTA),
      });
      return;
    }

    if (!reportedBy) {
      res.status(400).json({ error: 'reportedBy is required' });
      return;
    }

    const rec = store.observe(did, { type, reportedBy, detail });
    res.status(201).json({
      did: rec.did,
      score: rec.score,
      observations: rec.observations,
      flags: rec.flags,
    } satisfies ReputationSummary);
  });

  /**
   * GET /v1
   * List all tracked agents (requires API key).
   */
  app.get('/v1', requireApiKey, (_req: Request, res: Response) => {
    res.json(store.all());
  });

  return app;
}

/**
 * @tollway/server v0.1.0
 * Express / Next.js middleware for Tollway protocol.
 * Auto-generates tollway.json, validates agent identity, handles payments.
 */

import * as crypto from 'crypto';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ServerPolicy {
  /** Free requests per day before payment required */
  freeRequestsPerDay?: number;
  /** Pricing schedule by action */
  pricing?: Array<{ action: string; price: string }>;
  /** Whether training on content is allowed */
  trainingAllowed?: boolean;
  /** Whether attribution is required */
  attributionRequired?: boolean;
  /** Attribution format string */
  attributionFormat?: string;
  /** Whether caching is allowed */
  cacheAllowed?: boolean;
  /** Cache TTL in seconds */
  cacheTtlSeconds?: number;
  /** Minimum reputation score required (0-1) */
  minimumReputation?: number;
  /** Whether a valid DID is required */
  requireDid?: boolean;
  /** Allowed action scopes */
  allowedActions?: string[];
  /** Prohibited action scopes */
  prohibitedActions?: string[];
  /** Actions that require payment */
  paymentRequiredActions?: string[];
  /** Requests per minute rate limit */
  requestsPerMinute?: number;
  /** Requests per day rate limit */
  requestsPerDay?: number;
}

export interface MiddlewareOptions {
  policy: ServerPolicy;
  /** USDC wallet address for receiving payments */
  paymentAddress?: string;
  /** Payment network (default: "base") */
  paymentNetwork?: string;
  /** Reputation oracle URL for verification */
  reputationOracle?: string;
  /** Log agent requests (default: true) */
  enableLogging?: boolean;
  /** Called on each verified agent request */
  onAgentRequest?: (identity: AgentIdentity, req: unknown) => void;
  /** Called when payment is received */
  onPayment?: (payment: PaymentRecord) => void;
}

export interface AgentIdentity {
  did: string;
  principalDid?: string;
  purpose: string;
  scope: string;
  nonce: string;
  timestamp: string;
  signature?: string;
  wallet?: string;
  framework?: string;
  reputationOracle?: string;
  verified: boolean;
  reputationScore?: number;
}

export interface PaymentRecord {
  agentDid: string;
  txHash: string;
  network: string;
  paymentId: string;
  amount: string;
  currency: string;
  timestamp: string;
}

// ─── In-memory stores (replace with Redis/DB in production) ───────────────────

const nonceStore = new Map<string, number>(); // nonce -> timestamp
const requestCounts = new Map<string, { count: number; resetAt: number }>();
const pendingPayments = new Map<string, { price: string; currency: string; expiresAt: number }>();

function isNonceUsed(nonce: string): boolean {
  const ts = nonceStore.get(nonce);
  if (!ts) return false;
  // Expire nonces after 5 minutes
  if (Date.now() - ts > 5 * 60 * 1000) {
    nonceStore.delete(nonce);
    return false;
  }
  return true;
}

function recordNonce(nonce: string): void {
  nonceStore.set(nonce, Date.now());
  // Cleanup old nonces periodically
  if (nonceStore.size > 10000) {
    const cutoff = Date.now() - 5 * 60 * 1000;
    for (const [k, v] of nonceStore.entries()) {
      if (v < cutoff) nonceStore.delete(k);
    }
  }
}

function checkRateLimit(did: string, limit: number): boolean {
  const now = Date.now();
  const entry = requestCounts.get(did);
  if (!entry || entry.resetAt < now) {
    requestCounts.set(did, { count: 1, resetAt: now + 60 * 1000 });
    return true;
  }
  if (entry.count >= limit) return false;
  entry.count++;
  return true;
}

// ─── Build tollway.json ────────────────────────────────────────────────────────

export function buildTollwayJson(options: MiddlewareOptions): Record<string, unknown> {
  const { policy, paymentAddress, paymentNetwork = 'base' } = options;

  const json: Record<string, unknown> = {
    version: '0.1',
    updated: new Date().toISOString(),
  };

  if (policy.requireDid !== undefined || policy.minimumReputation !== undefined) {
    json.identity = {
      require_did: policy.requireDid ?? false,
      minimum_reputation: policy.minimumReputation ?? 0,
    };
  }

  if (policy.freeRequestsPerDay !== undefined || policy.pricing) {
    json.pricing = {
      currency: 'USDC',
      free_requests_per_day: policy.freeRequestsPerDay ?? 1000,
      schedule: policy.pricing ?? [],
    };
  }

  json.data_policy = {
    cache_allowed: policy.cacheAllowed ?? true,
    cache_ttl_seconds: policy.cacheTtlSeconds ?? 3600,
    training_allowed: policy.trainingAllowed ?? false,
    attribution_required: policy.attributionRequired ?? false,
    attribution_format: policy.attributionFormat ?? '{title} ({url})',
  };

  if (policy.requestsPerMinute || policy.requestsPerDay) {
    json.rate_limits = {
      requests_per_minute: policy.requestsPerMinute ?? 60,
      requests_per_day: policy.requestsPerDay ?? 10000,
    };
  }

  if (policy.allowedActions || policy.prohibitedActions) {
    json.actions = {
      allowed: policy.allowedActions ?? ['read', 'search', 'summarize'],
      prohibited: policy.prohibitedActions ?? ['scrape_bulk'],
      require_payment: policy.paymentRequiredActions ?? [],
    };
  }

  if (paymentAddress) {
    json.endpoints = {
      payment_address: paymentAddress,
      payment_network: paymentNetwork,
    };
  }

  return json;
}

// ─── Verify Agent Identity ────────────────────────────────────────────────────

function verifySignature(identity: AgentIdentity, method: string, url: string): boolean {
  if (!identity.signature) return false;

  try {
    const canonical = [
      identity.did,
      identity.purpose,
      identity.scope,
      identity.nonce,
      identity.timestamp,
      method.toUpperCase(),
      url,
    ].join('\n');

    // Extract public key from did:key
    // did:key:z6Mk... -> base58-decoded Ed25519 public key
    const didKeyPrefix = 'did:key:z6Mk';
    if (!identity.did.startsWith(didKeyPrefix)) {
      // Only did:key is supported in v0.1
      return false;
    }

    // TODO: Full multibase/multicodec decoding of did:key
    // A production implementation uses the `did-resolver` + `key-did-resolver` packages
    void canonical; // suppress unused variable warning
    return true; // Placeholder — full DID key resolution coming in v0.2
  } catch {
    return false;
  }
}

export function parseAgentIdentity(
  headers: Record<string, string | string[] | undefined>,
): AgentIdentity | null {
  const get = (key: string) => {
    const val = headers[key.toLowerCase()];
    return Array.isArray(val) ? val[0] : val;
  };

  const did = get('x-tollway-did');
  const purpose = get('x-tollway-purpose');
  const scope = get('x-tollway-scope');
  const nonce = get('x-tollway-nonce');
  const timestamp = get('x-tollway-timestamp');

  if (!did || !purpose || !scope || !nonce || !timestamp) return null;

  return {
    did,
    principalDid: get('x-tollway-principal'),
    purpose,
    scope,
    nonce,
    timestamp,
    signature: get('x-tollway-signature'),
    wallet: get('x-tollway-wallet'),
    framework: get('x-tollway-framework'),
    reputationOracle: get('x-tollway-reputation-oracle'),
    verified: false,
  };
}

// ─── Get price for scope ──────────────────────────────────────────────────────

function getPriceForScope(scope: string, policy: ServerPolicy): string | null {
  if (!policy.pricing) return null;
  const entry = policy.pricing.find(p => p.action === scope);
  return entry?.price ?? null;
}

// ─── Express Middleware ────────────────────────────────────────────────────────

export function tollwayMiddleware(options: MiddlewareOptions) {
  const { policy, paymentAddress, enableLogging = true } = options;
  const tollwayJson = buildTollwayJson(options);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return function tollwayHandler(req: any, res: any, next: any) {
    // Serve tollway.json
    if (req.path === '/.well-known/tollway.json') {
      return res.json(tollwayJson);
    }

    // Parse agent identity from headers
    const identity = parseAgentIdentity(req.headers as Record<string, string | undefined>);

    // If no Tollway headers present, pass through (non-agent traffic)
    if (!identity) return next();

    // Validate timestamp freshness (5 minute window)
    const reqTime = new Date(identity.timestamp).getTime();
    if (isNaN(reqTime) || Math.abs(Date.now() - reqTime) > 5 * 60 * 1000) {
      return res.status(400).json({
        error: 'tollway_timestamp_invalid',
        message: 'Request timestamp is outside the 5-minute window',
      });
    }

    // Check nonce for replay attacks
    if (isNonceUsed(identity.nonce)) {
      return res.status(400).json({
        error: 'tollway_replay_attack',
        message: 'Nonce has already been used',
      });
    }
    recordNonce(identity.nonce);

    // Check if DID is required
    if (policy.requireDid && !identity.did.startsWith('did:')) {
      return res.status(403).json({
        error: 'tollway_did_required',
        message: 'A valid DID is required to access this resource',
      });
    }

    // Check if action is prohibited
    if (policy.prohibitedActions?.includes(identity.scope)) {
      return res.status(403).json({
        error: 'tollway_action_prohibited',
        message: `Action "${identity.scope}" is not permitted on this site`,
      });
    }

    // Check rate limits
    if (policy.requestsPerMinute) {
      if (!checkRateLimit(identity.did, policy.requestsPerMinute)) {
        return res.status(429).json({
          error: 'tollway_rate_limit',
          message: 'Rate limit exceeded',
        });
      }
    }

    // Verify signature
    identity.verified = verifySignature(identity, req.method as string, req.url as string);

    // Check if payment is required
    const paymentProof = req.headers['x-tollway-payment'];
    const requiresPayment = policy.paymentRequiredActions?.includes(identity.scope);

    if (requiresPayment && !paymentProof && paymentAddress) {
      const price = getPriceForScope(identity.scope, policy);
      if (price) {
        const paymentId = `pay_${crypto.randomBytes(8).toString('hex')}`;
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

        pendingPayments.set(paymentId, {
          price,
          currency: 'USDC',
          expiresAt: Date.now() + 5 * 60 * 1000,
        });

        return res.status(402).json({
          tollway_version: '0.1',
          price,
          currency: 'USDC',
          network: options.paymentNetwork ?? 'base',
          payment_address: paymentAddress,
          payment_id: paymentId,
          expires_at: expiresAt,
          memo: `${identity.scope} access: ${req.url as string}`,
        });
      }
    }

    // Log agent request
    if (enableLogging) {
      const logEntry = {
        timestamp: new Date().toISOString(),
        did: identity.did,
        purpose: identity.purpose,
        scope: identity.scope,
        url: req.url,
        method: req.method,
        verified: identity.verified,
        paid: !!paymentProof,
        framework: identity.framework,
      };
      console.log('[tollway]', JSON.stringify(logEntry));
    }

    // Attach identity to request for downstream handlers
    req.tollwayIdentity = identity;

    // Add Tollway response headers
    res.setHeader('X-Tollway-Served', '1');
    res.setHeader('X-Tollway-Version', '0.1');

    if (options.onAgentRequest) {
      options.onAgentRequest(identity, req);
    }

    return next();
  };
}

// ─── Next.js Middleware ────────────────────────────────────────────────────────

export function createNextjsMiddleware(options: MiddlewareOptions) {
  const tollwayJson = buildTollwayJson(options);

  return async function middleware(request: Request): Promise<Response | null> {
    const url = new URL(request.url);

    // Serve tollway.json
    if (url.pathname === '/.well-known/tollway.json') {
      return new Response(JSON.stringify(tollwayJson, null, 2), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // For non-tollway requests, return null to continue
    const hasTollwayHeaders = request.headers.has('x-tollway-did');
    if (!hasTollwayHeaders) return null;

    // Parse and validate identity
    const headers: Record<string, string> = {};
    request.headers.forEach((v, k) => { headers[k] = v; });
    const identity = parseAgentIdentity(headers);
    if (!identity) return null;

    // Check prohibited actions
    if (options.policy.prohibitedActions?.includes(identity.scope)) {
      return new Response(
        JSON.stringify({
          error: 'tollway_action_prohibited',
          message: `Action "${identity.scope}" is not permitted`,
        }),
        { status: 403, headers: { 'Content-Type': 'application/json' } },
      );
    }

    // Pass through with identity available for downstream
    return null;
  };
}

// ─── Standalone tollway.json generator ────────────────────────────────────────

export function generateTollwayJson(policy: ServerPolicy, paymentAddress?: string): string {
  return JSON.stringify(buildTollwayJson({ policy, paymentAddress }), null, 2);
}

export default { tollwayMiddleware, createNextjsMiddleware, generateTollwayJson, buildTollwayJson };

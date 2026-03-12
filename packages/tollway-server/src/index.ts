/**
 * @tollway/server v0.1.0
 * Express / Next.js middleware for Tollway protocol.
 * Auto-generates tollway.json, validates agent identity, handles payments.
 */

import * as crypto from 'crypto';
import bs58 from 'bs58';

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

const nonceStore = new Map<string, number>();
const requestCounts = new Map<string, { count: number; resetAt: number }>();
const pendingPayments = new Map<string, { price: string; currency: string; expiresAt: number }>();

const DID_KEY_PREFIX = 'did:key:';
const ED25519_MULTICODEC_PREFIX = Buffer.from([0xed, 0x01]);
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

function isNonceUsed(nonce: string): boolean {
  const ts = nonceStore.get(nonce);
  if (!ts) return false;

  if (Date.now() - ts > 5 * 60 * 1000) {
    nonceStore.delete(nonce);
    return false;
  }

  return true;
}

function recordNonce(nonce: string): void {
  nonceStore.set(nonce, Date.now());

  if (nonceStore.size > 10000) {
    const cutoff = Date.now() - 5 * 60 * 1000;
    for (const [key, value] of nonceStore.entries()) {
      if (value < cutoff) nonceStore.delete(key);
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

function createPublicKeyFromDid(did: string): crypto.KeyObject | null {
  if (!did.startsWith(DID_KEY_PREFIX)) return null;

  const multibaseValue = did.slice(DID_KEY_PREFIX.length);
  if (!multibaseValue.startsWith('z')) return null;

  const decoded = Buffer.from(bs58.decode(multibaseValue.slice(1)));
  if (decoded.length !== 34 || !decoded.subarray(0, 2).equals(ED25519_MULTICODEC_PREFIX)) {
    return null;
  }

  const publicKeyBytes = decoded.subarray(2);
  return crypto.createPublicKey({
    key: Buffer.concat([ED25519_SPKI_PREFIX, publicKeyBytes]),
    format: 'der',
    type: 'spki',
  });
}

function buildCanonicalRequest(
  identity: AgentIdentity,
  method: string,
  url: string,
): string {
  return [
    identity.did,
    identity.purpose,
    identity.scope,
    identity.nonce,
    identity.timestamp,
    method.toUpperCase(),
    url,
  ].join('\n');
}

function verifySignature(identity: AgentIdentity, method: string, urls: string[]): boolean {
  if (!identity.signature) return false;

  try {
    const publicKey = createPublicKeyFromDid(identity.did);
    if (!publicKey) return false;

    const signature = Buffer.from(identity.signature, 'base64url');
    return urls.some(url =>
      crypto.verify(
        null,
        Buffer.from(buildCanonicalRequest(identity, method, url), 'utf8'),
        publicKey,
        signature,
      ),
    );
  } catch {
    return false;
  }
}

export function parseAgentIdentity(
  headers: Record<string, string | string[] | undefined>,
): AgentIdentity | null {
  const get = (key: string) => {
    const value = headers[key.toLowerCase()];
    return Array.isArray(value) ? value[0] : value;
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

function getPriceForScope(scope: string, policy: ServerPolicy): string | null {
  if (!policy.pricing) return null;
  const entry = policy.pricing.find(item => item.action === scope);
  return entry?.price ?? null;
}

function buildVerificationUrls(req: {
  url?: string;
  originalUrl?: string;
  protocol?: string;
  headers: Record<string, string | string[] | undefined>;
}): string[] {
  const urls = new Set<string>();

  if (typeof req.originalUrl === 'string') urls.add(req.originalUrl);
  if (typeof req.url === 'string') urls.add(req.url);

  const forwardedProto = req.headers['x-forwarded-proto'];
  const protocol = typeof req.protocol === 'string'
    ? req.protocol
    : Array.isArray(forwardedProto)
      ? forwardedProto[0]
      : forwardedProto ?? 'https';
  const hostHeader = req.headers.host;
  const host = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;

  if (host) {
    for (const path of Array.from(urls)) {
      urls.add(`${protocol}://${host}${path}`);
    }
  }

  return Array.from(urls);
}

export function tollwayMiddleware(options: MiddlewareOptions) {
  const { policy, paymentAddress, enableLogging = true } = options;
  const tollwayJson = buildTollwayJson(options);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return function tollwayHandler(req: any, res: any, next: any) {
    if (req.path === '/.well-known/tollway.json') {
      return res.json(tollwayJson);
    }

    const identity = parseAgentIdentity(req.headers as Record<string, string | undefined>);
    if (!identity) return next();

    const reqTime = new Date(identity.timestamp).getTime();
    if (isNaN(reqTime) || Math.abs(Date.now() - reqTime) > 5 * 60 * 1000) {
      return res.status(400).json({
        error: 'tollway_timestamp_invalid',
        message: 'Request timestamp is outside the 5-minute window',
      });
    }

    if (isNonceUsed(identity.nonce)) {
      return res.status(400).json({
        error: 'tollway_replay_attack',
        message: 'Nonce has already been used',
      });
    }
    recordNonce(identity.nonce);

    if (policy.requireDid && !identity.did.startsWith('did:')) {
      return res.status(403).json({
        error: 'tollway_did_required',
        message: 'A valid DID is required to access this resource',
      });
    }

    if (policy.prohibitedActions?.includes(identity.scope)) {
      return res.status(403).json({
        error: 'tollway_action_prohibited',
        message: `Action "${identity.scope}" is not permitted on this site`,
      });
    }

    if (policy.requestsPerMinute && !checkRateLimit(identity.did, policy.requestsPerMinute)) {
      return res.status(429).json({
        error: 'tollway_rate_limit',
        message: 'Rate limit exceeded',
      });
    }

    identity.verified = verifySignature(
      identity,
      req.method as string,
      buildVerificationUrls(req as {
        url?: string;
        originalUrl?: string;
        protocol?: string;
        headers: Record<string, string | string[] | undefined>;
      }),
    );

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

    req.tollwayIdentity = identity;
    res.setHeader('X-Tollway-Served', '1');
    res.setHeader('X-Tollway-Version', '0.1');

    if (options.onAgentRequest) {
      options.onAgentRequest(identity, req);
    }

    return next();
  };
}

export function createNextjsMiddleware(options: MiddlewareOptions) {
  const tollwayJson = buildTollwayJson(options);

  return async function middleware(request: Request): Promise<Response | null> {
    const url = new URL(request.url);

    if (url.pathname === '/.well-known/tollway.json') {
      return new Response(JSON.stringify(tollwayJson, null, 2), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!request.headers.has('x-tollway-did')) return null;

    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      headers[key] = value;
    });

    const identity = parseAgentIdentity(headers);
    if (!identity) return null;

    if (options.policy.prohibitedActions?.includes(identity.scope)) {
      return new Response(
        JSON.stringify({
          error: 'tollway_action_prohibited',
          message: `Action "${identity.scope}" is not permitted`,
        }),
        { status: 403, headers: { 'Content-Type': 'application/json' } },
      );
    }

    return null;
  };
}

export function generateTollwayJson(policy: ServerPolicy, paymentAddress?: string): string {
  return JSON.stringify(buildTollwayJson({ policy, paymentAddress }), null, 2);
}

export default { tollwayMiddleware, createNextjsMiddleware, generateTollwayJson, buildTollwayJson };

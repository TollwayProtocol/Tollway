/**
 * Tests for @tollway/server
 */

import * as crypto from 'crypto';
import bs58 from 'bs58';
import {
  buildTollwayJson,
  tollwayMiddleware,
  createNextjsMiddleware,
  generateTollwayJson,
  parseAgentIdentity,
} from '../index';
import type { ServerPolicy, MiddlewareOptions, AgentIdentity } from '../index';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BASE_POLICY: ServerPolicy = {
  freeRequestsPerDay: 100,
  trainingAllowed: false,
  attributionRequired: true,
  cacheAllowed: true,
  cacheTtlSeconds: 3600,
};

const BASE_OPTIONS: MiddlewareOptions = {
  policy: BASE_POLICY,
  paymentAddress: '0xPaymentAddress',
  paymentNetwork: 'base',
  enableLogging: false,
};

// ─── Mock req/res/next ─────────────────────────────────────────────────────────

function makeReq(overrides: Record<string, unknown> = {}) {
  return {
    path: '/page',
    url: '/page',
    method: 'GET',
    headers: {} as Record<string, string>,
    ...overrides,
  };
}

function makeRes() {
  const res = {
    status: jest.fn(),
    json: jest.fn(),
    setHeader: jest.fn(),
  };
  // Allow chaining: res.status(400).json({...})
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
}

function makeNext() {
  return jest.fn();
}

/** Unique nonce per test to avoid replay-attack rejections */
let nonceId = 0;
function freshNonce() {
  return `test-nonce-${++nonceId}-${Date.now()}`;
}

function agentHeaders(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    'x-tollway-did': 'did:key:z6MkTestAgent',
    'x-tollway-purpose': 'automated testing',
    'x-tollway-scope': 'read',
    'x-tollway-nonce': freshNonce(),
    'x-tollway-timestamp': new Date().toISOString(),
    ...overrides,
  };
}

function makePrivateKey(seedHex: string): crypto.KeyObject {
  return crypto.createPrivateKey({
    key: Buffer.concat([
      Buffer.from('302e020100300506032b657004220420', 'hex'),
      Buffer.from(seedHex, 'hex'),
    ]),
    format: 'der',
    type: 'pkcs8',
  });
}

function makeDidFromPrivateKey(privateKey: crypto.KeyObject): string {
  const spki = crypto.createPublicKey(privateKey).export({
    format: 'der',
    type: 'spki',
  }) as Buffer;
  const publicKey = spki.subarray(-32);
  const multicodec = Buffer.concat([Buffer.from([0xed, 0x01]), publicKey]);
  return `did:key:z${bs58.encode(multicodec)}`;
}

function makeSignedAgentHeaders(
  overrides: Record<string, string> = {},
  requestUrl = 'https://example.com/page',
  method = 'GET',
): Record<string, string> {
  const privateKey = makePrivateKey('1'.repeat(64));
  const did = makeDidFromPrivateKey(privateKey);
  const headers = agentHeaders({
    'x-tollway-did': did,
    ...overrides,
  });

  const canonical = [
    headers['x-tollway-did'],
    headers['x-tollway-purpose'],
    headers['x-tollway-scope'],
    headers['x-tollway-nonce'],
    headers['x-tollway-timestamp'],
    method,
    requestUrl,
  ].join('\n');

  headers['x-tollway-signature'] = crypto
    .sign(null, Buffer.from(canonical, 'utf8'), privateKey)
    .toString('base64url');

  return headers;
}

// ─── buildTollwayJson ─────────────────────────────────────────────────────────

describe('buildTollwayJson', () => {
  test('always includes version "0.1" and an updated timestamp', () => {
    const json = buildTollwayJson(BASE_OPTIONS);
    expect(json.version).toBe('0.1');
    expect(typeof json.updated).toBe('string');
    expect(new Date(json.updated as string).getTime()).not.toBeNaN();
  });

  test('data_policy reflects ServerPolicy values', () => {
    const json = buildTollwayJson(BASE_OPTIONS);
    const dp = json.data_policy as Record<string, unknown>;
    expect(dp.training_allowed).toBe(false);
    expect(dp.attribution_required).toBe(true);
    expect(dp.cache_allowed).toBe(true);
    expect(dp.cache_ttl_seconds).toBe(3600);
    expect(dp.attribution_format).toBe('{title} ({url})');
  });

  test('includes pricing when freeRequestsPerDay is set', () => {
    const json = buildTollwayJson(BASE_OPTIONS);
    const pricing = json.pricing as Record<string, unknown>;
    expect(pricing.currency).toBe('USDC');
    expect(pricing.free_requests_per_day).toBe(100);
    expect(Array.isArray(pricing.schedule)).toBe(true);
  });

  test('includes a pricing schedule when pricing array is provided', () => {
    const json = buildTollwayJson({
      policy: { ...BASE_POLICY, pricing: [{ action: 'train', price: '0.001' }] },
    });
    const schedule = (json.pricing as Record<string, unknown>).schedule as unknown[];
    expect(schedule).toHaveLength(1);
    expect(schedule[0]).toEqual({ action: 'train', price: '0.001' });
  });

  test('includes endpoints when paymentAddress is provided', () => {
    const json = buildTollwayJson(BASE_OPTIONS);
    const ep = json.endpoints as Record<string, unknown>;
    expect(ep.payment_address).toBe('0xPaymentAddress');
    expect(ep.payment_network).toBe('base');
  });

  test('omits endpoints when paymentAddress is not provided', () => {
    const json = buildTollwayJson({ policy: BASE_POLICY });
    expect(json.endpoints).toBeUndefined();
  });

  test('includes identity block when requireDid is set', () => {
    const json = buildTollwayJson({
      policy: { ...BASE_POLICY, requireDid: true, minimumReputation: 0.5 },
    });
    const identity = json.identity as Record<string, unknown>;
    expect(identity.require_did).toBe(true);
    expect(identity.minimum_reputation).toBe(0.5);
  });

  test('omits identity block when neither requireDid nor minimumReputation are set', () => {
    const json = buildTollwayJson({ policy: { trainingAllowed: false } });
    expect(json.identity).toBeUndefined();
  });

  test('includes actions block when allowedActions or prohibitedActions are set', () => {
    const json = buildTollwayJson({
      policy: {
        ...BASE_POLICY,
        allowedActions: ['read', 'search'],
        prohibitedActions: ['scrape_bulk'],
        paymentRequiredActions: ['train'],
      },
    });
    const actions = json.actions as Record<string, unknown>;
    expect(actions.allowed).toEqual(['read', 'search']);
    expect(actions.prohibited).toEqual(['scrape_bulk']);
    expect(actions.require_payment).toEqual(['train']);
  });

  test('includes rate_limits when requestsPerMinute or requestsPerDay are set', () => {
    const json = buildTollwayJson({
      policy: { ...BASE_POLICY, requestsPerMinute: 30, requestsPerDay: 5000 },
    });
    const limits = json.rate_limits as Record<string, unknown>;
    expect(limits.requests_per_minute).toBe(30);
    expect(limits.requests_per_day).toBe(5000);
  });

  test('omits rate_limits when neither value is set', () => {
    const json = buildTollwayJson({ policy: BASE_POLICY });
    expect(json.rate_limits).toBeUndefined();
  });
});

// ─── generateTollwayJson ──────────────────────────────────────────────────────

describe('generateTollwayJson', () => {
  test('returns a valid JSON string', () => {
    const json = generateTollwayJson(BASE_POLICY, '0xAddr');
    expect(() => JSON.parse(json)).not.toThrow();
  });

  test('is pretty-printed', () => {
    const json = generateTollwayJson(BASE_POLICY);
    expect(json).toContain('\n');
    expect(json).toContain('  ');
  });

  test('includes payment address when provided', () => {
    const json = JSON.parse(generateTollwayJson(BASE_POLICY, '0xMyAddr')) as Record<string, unknown>;
    expect((json.endpoints as Record<string, unknown>).payment_address).toBe('0xMyAddr');
  });
});

// ─── parseAgentIdentity ───────────────────────────────────────────────────────

describe('parseAgentIdentity', () => {
  test('returns identity when all required headers are present', () => {
    const headers = agentHeaders();
    const identity = parseAgentIdentity(headers);
    expect(identity).not.toBeNull();
    expect(identity!.did).toBe('did:key:z6MkTestAgent');
    expect(identity!.scope).toBe('read');
    expect(identity!.verified).toBe(false);
  });

  test('returns null when any required header is missing', () => {
    const required = ['x-tollway-did', 'x-tollway-purpose', 'x-tollway-scope', 'x-tollway-nonce', 'x-tollway-timestamp'];
    for (const missing of required) {
      const headers = agentHeaders();
      delete headers[missing];
      expect(parseAgentIdentity(headers)).toBeNull();
    }
  });

  test('parses optional headers when present', () => {
    const headers = agentHeaders({
      'x-tollway-principal': 'did:key:zPrincipal',
      'x-tollway-wallet': '0xWallet',
      'x-tollway-framework': 'langchain/0.3.0',
      'x-tollway-signature': 'sig123',
    });
    const identity = parseAgentIdentity(headers);
    expect(identity!.principalDid).toBe('did:key:zPrincipal');
    expect(identity!.wallet).toBe('0xWallet');
    expect(identity!.framework).toBe('langchain/0.3.0');
    expect(identity!.signature).toBe('sig123');
  });

  test('handles array header values (takes first)', () => {
    const headers: Record<string, string | string[]> = agentHeaders();
    headers['x-tollway-did'] = ['did:key:zFirst', 'did:key:zSecond'];
    const identity = parseAgentIdentity(headers);
    expect(identity!.did).toBe('did:key:zFirst');
  });
});

// ─── tollwayMiddleware ─────────────────────────────────────────────────────────

describe('tollwayMiddleware', () => {
  test('serves tollway.json at /.well-known/tollway.json', () => {
    const middleware = tollwayMiddleware(BASE_OPTIONS);
    const req = makeReq({ path: '/.well-known/tollway.json' });
    const res = makeRes();
    const next = makeNext();

    middleware(req, res, next);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ version: '0.1' }));
    expect(next).not.toHaveBeenCalled();
  });

  test('passes through non-agent requests (no Tollway headers)', () => {
    const middleware = tollwayMiddleware(BASE_OPTIONS);
    const req = makeReq({ headers: {} });
    const res = makeRes();
    const next = makeNext();

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('rejects requests with expired timestamps (400)', () => {
    const middleware = tollwayMiddleware(BASE_OPTIONS);
    const oldTs = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // 10 min ago
    const req = makeReq({ headers: agentHeaders({ 'x-tollway-timestamp': oldTs }) });
    const res = makeRes();
    const next = makeNext();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    const body = (res.json as jest.Mock).mock.calls[0]![0] as Record<string, unknown>;
    expect(body.error).toBe('tollway_timestamp_invalid');
  });

  test('rejects requests with future timestamps beyond the 5-min window (400)', () => {
    const middleware = tollwayMiddleware(BASE_OPTIONS);
    const futureTs = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const req = makeReq({ headers: agentHeaders({ 'x-tollway-timestamp': futureTs }) });
    const res = makeRes();
    const next = makeNext();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('rejects replayed nonces (400)', () => {
    const middleware = tollwayMiddleware(BASE_OPTIONS);
    const nonce = `replay-${Date.now()}-${Math.random()}`;
    const headers = agentHeaders({ 'x-tollway-nonce': nonce });

    // First request — should succeed
    middleware(makeReq({ headers }), makeRes(), makeNext());

    // Second request with same nonce — should be rejected
    const res = makeRes();
    middleware(makeReq({ headers: { ...headers } }), res, makeNext());

    expect(res.status).toHaveBeenCalledWith(400);
    const body = (res.json as jest.Mock).mock.calls[0]![0] as Record<string, unknown>;
    expect(body.error).toBe('tollway_replay_attack');
  });

  test('rejects prohibited action scopes (403)', () => {
    const middleware = tollwayMiddleware({
      ...BASE_OPTIONS,
      policy: { ...BASE_POLICY, prohibitedActions: ['scrape_bulk'] },
    });
    const req = makeReq({
      headers: agentHeaders({ 'x-tollway-scope': 'scrape_bulk' }),
    });
    const res = makeRes();

    middleware(req, res, makeNext());

    expect(res.status).toHaveBeenCalledWith(403);
    const body = (res.json as jest.Mock).mock.calls[0]![0] as Record<string, unknown>;
    expect(body.error).toBe('tollway_action_prohibited');
  });

  test('enforces per-minute rate limits (429)', () => {
    // Use a unique DID per test run to avoid cross-test rate limit state
    const did = `did:key:z6MkRateTest-${Date.now()}-${Math.random()}`;
    const middleware = tollwayMiddleware({
      ...BASE_OPTIONS,
      policy: { ...BASE_POLICY, requestsPerMinute: 1 },
    });

    // First request — allowed
    const res1 = makeRes();
    const next1 = makeNext();
    middleware(makeReq({ headers: agentHeaders({ 'x-tollway-did': did }) }), res1, next1);
    expect(next1).toHaveBeenCalled();

    // Second request — rate limited
    const res2 = makeRes();
    middleware(makeReq({ headers: agentHeaders({ 'x-tollway-did': did }) }), res2, makeNext());
    expect(res2.status).toHaveBeenCalledWith(429);
    const body = (res2.json as jest.Mock).mock.calls[0]![0] as Record<string, unknown>;
    expect(body.error).toBe('tollway_rate_limit');
  });

  test('returns 402 when payment is required and not provided', () => {
    const middleware = tollwayMiddleware({
      ...BASE_OPTIONS,
      policy: {
        ...BASE_POLICY,
        paymentRequiredActions: ['train'],
        pricing: [{ action: 'train', price: '0.001' }],
      },
    });
    const req = makeReq({
      headers: agentHeaders({ 'x-tollway-scope': 'train' }),
    });
    const res = makeRes();

    middleware(req, res, makeNext());

    expect(res.status).toHaveBeenCalledWith(402);
    const body = (res.json as jest.Mock).mock.calls[0]![0] as Record<string, unknown>;
    expect(body.price).toBe('0.001');
    expect(body.currency).toBe('USDC');
    expect(body.payment_address).toBe('0xPaymentAddress');
    expect(body.network).toBe('base');
    expect(typeof body.payment_id).toBe('string');
  });

  test('passes through a payment-required action when proof is supplied', () => {
    const middleware = tollwayMiddleware({
      ...BASE_OPTIONS,
      policy: {
        ...BASE_POLICY,
        paymentRequiredActions: ['train'],
        pricing: [{ action: 'train', price: '0.001' }],
      },
    });
    const req = makeReq({
      headers: {
        ...agentHeaders({ 'x-tollway-scope': 'train' }),
        'x-tollway-payment': JSON.stringify({ tx_hash: '0xabc' }),
      },
    });
    const next = makeNext();

    middleware(req, makeRes(), next);

    expect(next).toHaveBeenCalled();
  });

  test('marks a valid did:key Ed25519 signature as verified', () => {
    const middleware = tollwayMiddleware(BASE_OPTIONS);
    const req = makeReq({
      protocol: 'https',
      originalUrl: '/page',
      headers: {
        ...makeSignedAgentHeaders(),
        host: 'example.com',
      },
    }) as Record<string, unknown>;
    const next = makeNext();

    middleware(req, makeRes(), next);

    expect(next).toHaveBeenCalled();
    const identity = req['tollwayIdentity'] as AgentIdentity;
    expect(identity.verified).toBe(true);
  });

  test('marks an invalid signature as unverified', () => {
    const middleware = tollwayMiddleware(BASE_OPTIONS);
    const req = makeReq({
      protocol: 'https',
      originalUrl: '/page',
      headers: {
        ...makeSignedAgentHeaders(),
        host: 'example.com',
        'x-tollway-signature': Buffer.from('tampered').toString('base64url'),
      },
    }) as Record<string, unknown>;
    const next = makeNext();

    middleware(req, makeRes(), next);

    expect(next).toHaveBeenCalled();
    const identity = req['tollwayIdentity'] as AgentIdentity;
    expect(identity.verified).toBe(false);
  });

  test('attaches tollwayIdentity to the request and calls next() for valid requests', () => {
    const middleware = tollwayMiddleware(BASE_OPTIONS);
    const req = makeReq({ headers: agentHeaders() }) as Record<string, unknown>;
    const next = makeNext();

    middleware(req, makeRes(), next);

    expect(next).toHaveBeenCalled();
    const identity = req['tollwayIdentity'] as AgentIdentity;
    expect(identity.did).toBe('did:key:z6MkTestAgent');
    expect(identity.scope).toBe('read');
  });

  test('sets X-Tollway-Served and X-Tollway-Version response headers', () => {
    const middleware = tollwayMiddleware(BASE_OPTIONS);
    const res = makeRes();

    middleware(makeReq({ headers: agentHeaders() }), res, makeNext());

    expect(res.setHeader).toHaveBeenCalledWith('X-Tollway-Served', '1');
    expect(res.setHeader).toHaveBeenCalledWith('X-Tollway-Version', '0.1');
  });

  test('calls onAgentRequest callback with identity and request', () => {
    const onAgentRequest = jest.fn();
    const middleware = tollwayMiddleware({ ...BASE_OPTIONS, onAgentRequest });
    const req = makeReq({ headers: agentHeaders() });

    middleware(req, makeRes(), makeNext());

    expect(onAgentRequest).toHaveBeenCalledWith(
      expect.objectContaining({ did: 'did:key:z6MkTestAgent' }),
      req,
    );
  });

  test('does not require DID validation unless requireDid is set', () => {
    const middleware = tollwayMiddleware({
      ...BASE_OPTIONS,
      policy: { ...BASE_POLICY, requireDid: false },
    });
    const req = makeReq({
      headers: agentHeaders({ 'x-tollway-did': 'not-a-did' }),
    });
    const next = makeNext();

    middleware(req, makeRes(), next);

    expect(next).toHaveBeenCalled();
  });
});

// ─── createNextjsMiddleware ───────────────────────────────────────────────────

describe('createNextjsMiddleware', () => {
  test('serves tollway.json at /.well-known/tollway.json', async () => {
    const middleware = createNextjsMiddleware(BASE_OPTIONS);
    const request = new Request('https://example.com/.well-known/tollway.json');

    const response = await middleware(request);

    expect(response).not.toBeNull();
    expect(response!.status).toBe(200);
    const body = await response!.json() as Record<string, unknown>;
    expect(body.version).toBe('0.1');
  });

  test('returns null for plain requests without Tollway headers', async () => {
    const middleware = createNextjsMiddleware(BASE_OPTIONS);
    const request = new Request('https://example.com/page');

    const response = await middleware(request);

    expect(response).toBeNull();
  });

  test('returns null (pass-through) for valid agent requests', async () => {
    const middleware = createNextjsMiddleware(BASE_OPTIONS);
    const request = new Request('https://example.com/page', {
      headers: agentHeaders(),
    });

    const response = await middleware(request);

    expect(response).toBeNull();
  });

  test('returns 403 for prohibited action scope', async () => {
    const middleware = createNextjsMiddleware({
      ...BASE_OPTIONS,
      policy: { ...BASE_POLICY, prohibitedActions: ['scrape_bulk'] },
    });
    const request = new Request('https://example.com/page', {
      headers: agentHeaders({ 'x-tollway-scope': 'scrape_bulk' }),
    });

    const response = await middleware(request);

    expect(response).not.toBeNull();
    expect(response!.status).toBe(403);
    const body = await response!.json() as Record<string, unknown>;
    expect(body.error).toBe('tollway_action_prohibited');
  });

  test('returns tollway.json with correct Content-Type', async () => {
    const middleware = createNextjsMiddleware(BASE_OPTIONS);
    const request = new Request('https://example.com/.well-known/tollway.json');

    const response = await middleware(request);

    expect(response!.headers.get('content-type')).toBe('application/json');
  });
});

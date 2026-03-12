/**
 * Tests for @tollway/client
 */

import { fetch as tollwayFetch, createAgent, getReputation } from '../index';
import type { TollwayOptions } from '../index';

// ─── Mock Setup ────────────────────────────────────────────────────────────────

const mockFetch = jest.fn();

beforeAll(() => {
  // Replace the global fetch with our mock
  (globalThis as Record<string, unknown>).fetch = mockFetch;
});

beforeEach(() => {
  mockFetch.mockReset();
});

// ─── Helpers ───────────────────────────────────────────────────────────────────

function makeResponse(
  body: string,
  status = 200,
  contentType = 'text/html',
): Response {
  const headers = new Map<string, string>([['content-type', contentType]]);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (key: string) => headers.get(key.toLowerCase()) ?? null,
      has: (key: string) => headers.has(key.toLowerCase()),
    },
    json: () => Promise.resolve(JSON.parse(body)),
    text: () => Promise.resolve(body),
  } as unknown as Response;
}

/** Unique origin per test to avoid policy cache cross-contamination */
let testId = 0;
function uniqueOrigin() {
  return `https://test-${++testId}.tollway-test.internal`;
}

const BASE_DID = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK';
const BASE_OPTS: TollwayOptions = {
  did: BASE_DID,
  privateKey: 'a'.repeat(64), // 32-byte hex — triggers graceful sign failure, headers still sent
  purpose: 'Test research',
  scope: 'read',
};

const MOCK_HTML = `<html>
  <head>
    <title>Page Title</title>
    <meta property="og:title" content="OG Title" />
    <meta property="og:description" content="OG description text" />
    <link rel="canonical" href="https://example.com/canonical-url" />
  </head>
  <body><p>Content here</p></body>
</html>`;

// ─── tollwayFetch ──────────────────────────────────────────────────────────────

describe('fetch', () => {
  test('fetches tollway.json before the main request', async () => {
    const origin = uniqueOrigin();
    mockFetch
      .mockResolvedValueOnce(makeResponse('', 404))        // policy 404
      .mockResolvedValueOnce(makeResponse(MOCK_HTML));      // main request

    await tollwayFetch(`${origin}/page`, { tollway: BASE_OPTS });

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(String(mockFetch.mock.calls[0]![0])).toContain('/.well-known/tollway.json');
  });

  test('adds required Tollway identity headers', async () => {
    const origin = uniqueOrigin();
    mockFetch
      .mockResolvedValueOnce(makeResponse('', 404))
      .mockResolvedValueOnce(makeResponse(MOCK_HTML));

    await tollwayFetch(`${origin}/`, { tollway: BASE_OPTS });

    const headers = mockFetch.mock.calls[1]![1]?.headers as Record<string, string>;
    expect(headers['X-Tollway-DID']).toBe(BASE_DID);
    expect(headers['X-Tollway-Purpose']).toBe('Test research');
    expect(headers['X-Tollway-Scope']).toBe('read');
    expect(headers['X-Tollway-Version']).toBe('0.1');
    expect(headers['X-Tollway-Nonce']).toBeDefined();
    expect(headers['X-Tollway-Timestamp']).toBeDefined();
  });

  test('adds optional headers when configured', async () => {
    const origin = uniqueOrigin();
    mockFetch
      .mockResolvedValueOnce(makeResponse('', 404))
      .mockResolvedValueOnce(makeResponse(MOCK_HTML));

    const opts: TollwayOptions = {
      ...BASE_OPTS,
      wallet: '0xMyWallet',
      principalDid: 'did:key:zPrincipal',
      framework: 'langchain/0.3.0',
      reputationOracle: 'https://rep.example.com/v1',
    };

    await tollwayFetch(`${origin}/`, { tollway: opts });

    const headers = mockFetch.mock.calls[1]![1]?.headers as Record<string, string>;
    expect(headers['X-Tollway-Wallet']).toBe('0xMyWallet');
    expect(headers['X-Tollway-Principal']).toBe('did:key:zPrincipal');
    expect(headers['X-Tollway-Framework']).toBe('langchain/0.3.0');
    expect(headers['X-Tollway-Reputation-Oracle']).toBe('https://rep.example.com/v1');
  });

  test('omits DID headers when no tollway options provided', async () => {
    const origin = uniqueOrigin();
    mockFetch
      .mockResolvedValueOnce(makeResponse('', 404))   // policy still fetched
      .mockResolvedValueOnce(makeResponse(MOCK_HTML));

    await tollwayFetch(`${origin}/`);

    const headers = mockFetch.mock.calls[1]![1]?.headers as Record<string, string> | undefined;
    expect(headers?.['X-Tollway-DID']).toBeUndefined();
  });

  test('returns structured data extracted from HTML', async () => {
    const origin = uniqueOrigin();
    mockFetch
      .mockResolvedValueOnce(makeResponse('', 404))
      .mockResolvedValueOnce(makeResponse(MOCK_HTML));

    const result = await tollwayFetch(`${origin}/`, { tollway: BASE_OPTS });

    expect(result.data).not.toBeNull();
    expect(result.data?.title).toBe('OG Title');
    expect(result.data?.description).toBe('OG description text');
    expect(result.data?.url).toBe('https://example.com/canonical-url');
  });

  test('falls back to <title> when og:title is absent', async () => {
    const origin = uniqueOrigin();
    const html = '<html><head><title>Plain Title</title></head><body/></html>';
    mockFetch
      .mockResolvedValueOnce(makeResponse('', 404))
      .mockResolvedValueOnce(makeResponse(html));

    const result = await tollwayFetch(`${origin}/`, { tollway: BASE_OPTS });

    expect(result.data?.title).toBe('Plain Title');
  });

  test('returns null data for non-HTML responses', async () => {
    const origin = uniqueOrigin();
    mockFetch
      .mockResolvedValueOnce(makeResponse('', 404))
      .mockResolvedValueOnce(makeResponse('{"key":"val"}', 200, 'application/json'));

    const result = await tollwayFetch(`${origin}/api`, { tollway: BASE_OPTS });

    expect(result.data).toBeNull();
  });

  test('caches site policy — only one policy fetch per origin', async () => {
    const origin = uniqueOrigin();
    // Policy must return 200 to be cached; a 404 is not stored
    const policy = JSON.stringify({ version: '0.1' });
    mockFetch
      .mockResolvedValueOnce(makeResponse(policy, 200, 'application/json')) // policy (cached)
      .mockResolvedValueOnce(makeResponse(MOCK_HTML))                       // first request
      .mockResolvedValueOnce(makeResponse(MOCK_HTML));                      // second request (no re-fetch)

    await tollwayFetch(`${origin}/a`, { tollway: BASE_OPTS });
    await tollwayFetch(`${origin}/b`, { tollway: BASE_OPTS });

    const policyCalls = mockFetch.mock.calls.filter(c =>
      String(c[0]).includes('tollway.json'),
    );
    expect(policyCalls).toHaveLength(1);
  });

  test('throws when site policy prohibits the requested scope', async () => {
    const origin = uniqueOrigin();
    const policy = JSON.stringify({ version: '0.1', actions: { prohibited: ['scrape_bulk'] } });
    mockFetch.mockResolvedValueOnce(makeResponse(policy, 200, 'application/json'));

    await expect(
      tollwayFetch(`${origin}/`, { tollway: { ...BASE_OPTS, scope: 'scrape_bulk' } }),
    ).rejects.toThrow('prohibited');
  });

  test('handles 402 and retries with payment proof', async () => {
    const origin = uniqueOrigin();
    const paymentRequest = {
      tollway_version: '0.1',
      price: '0.001',
      currency: 'USDC',
      network: 'base',
      payment_address: '0xAddr',
      payment_id: 'pay_abc',
      expires_at: new Date(Date.now() + 300_000).toISOString(),
      memo: 'read access',
    };

    mockFetch
      .mockResolvedValueOnce(makeResponse('', 404))
      .mockResolvedValueOnce(makeResponse(JSON.stringify(paymentRequest), 402, 'application/json'))
      .mockResolvedValueOnce(makeResponse(MOCK_HTML));

    const onPaymentRequired = jest.fn().mockResolvedValue(
      JSON.stringify({ tx_hash: '0xabc', network: 'base', payment_id: 'pay_abc' }),
    );

    const result = await tollwayFetch(`${origin}/`, {
      tollway: { ...BASE_OPTS, wallet: '0xMyWallet', maxPriceUsdc: '0.01', onPaymentRequired },
    });

    expect(onPaymentRequired).toHaveBeenCalledWith(paymentRequest);
    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(result.paid).toBe(true);
    expect(result.cost).toBe('0.001');
  });

  test('skips payment when price exceeds maxPriceUsdc', async () => {
    const origin = uniqueOrigin();
    const paymentRequest = {
      tollway_version: '0.1',
      price: '1.00', // expensive
      currency: 'USDC',
      network: 'base',
      payment_address: '0xAddr',
      payment_id: 'pay_expensive',
      expires_at: new Date(Date.now() + 300_000).toISOString(),
      memo: 'expensive',
    };

    mockFetch
      .mockResolvedValueOnce(makeResponse('', 404))
      .mockResolvedValueOnce(makeResponse(JSON.stringify(paymentRequest), 402, 'application/json'));

    const result = await tollwayFetch(`${origin}/`, {
      tollway: { ...BASE_OPTS, wallet: '0xMyWallet', maxPriceUsdc: '0.01' },
    });

    // Should not retry — remains at 402
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result.paid).toBe(false);
    expect(result.status).toBe(402);
  });

  test('returns correct HTTP status code', async () => {
    const origin = uniqueOrigin();
    mockFetch
      .mockResolvedValueOnce(makeResponse('', 404))
      .mockResolvedValueOnce(makeResponse('<html><head><title>NF</title></head></html>', 404));

    const result = await tollwayFetch(`${origin}/missing`, { tollway: BASE_OPTS });

    expect(result.status).toBe(404);
  });

  test('attribution is null when not required by policy', async () => {
    const origin = uniqueOrigin();
    const policy = JSON.stringify({ version: '0.1', data_policy: { attribution_required: false } });
    mockFetch
      .mockResolvedValueOnce(makeResponse(policy, 200, 'application/json'))
      .mockResolvedValueOnce(makeResponse(MOCK_HTML));

    const result = await tollwayFetch(`${origin}/`, { tollway: BASE_OPTS });

    expect(result.attribution).toBeNull();
  });

  test('attribution is built when policy requires it', async () => {
    const origin = uniqueOrigin();
    const policy = JSON.stringify({
      version: '0.1',
      data_policy: {
        attribution_required: true,
        attribution_format: 'Source: {title} — {url}',
      },
    });
    mockFetch
      .mockResolvedValueOnce(makeResponse(policy, 200, 'application/json'))
      .mockResolvedValueOnce(makeResponse(MOCK_HTML));

    const result = await tollwayFetch(`${origin}/page`, { tollway: BASE_OPTS });

    expect(result.attribution).toMatch(/^Source: OG Title — /);
  });

  test('nonce is unique per request', async () => {
    const origin = uniqueOrigin();
    // Policy returns 404 (not cached), so each request triggers a policy fetch too.
    // Call sequence: policy-fetch-1, main-1, policy-fetch-2, main-2
    mockFetch
      .mockResolvedValueOnce(makeResponse('', 404))   // policy for /a
      .mockResolvedValueOnce(makeResponse(MOCK_HTML)) // main /a
      .mockResolvedValueOnce(makeResponse('', 404))   // policy for /b
      .mockResolvedValueOnce(makeResponse(MOCK_HTML)); // main /b

    await tollwayFetch(`${origin}/a`, { tollway: BASE_OPTS });
    await tollwayFetch(`${origin}/b`, { tollway: BASE_OPTS });

    // calls[1] = main /a, calls[3] = main /b
    const nonce1 = (mockFetch.mock.calls[1]![1]?.headers as Record<string, string>)['X-Tollway-Nonce'];
    const nonce2 = (mockFetch.mock.calls[3]![1]?.headers as Record<string, string>)['X-Tollway-Nonce'];
    expect(nonce1).toBeDefined();
    expect(nonce2).toBeDefined();
    expect(nonce1).not.toBe(nonce2);
  });
});

// ─── createAgent ──────────────────────────────────────────────────────────────

describe('createAgent', () => {
  test('returns an object with fetch, checkPolicy, and options', () => {
    const agent = createAgent(BASE_OPTS);
    expect(typeof agent.fetch).toBe('function');
    expect(typeof agent.checkPolicy).toBe('function');
    expect(agent.options).toEqual(BASE_OPTS);
  });

  test('agent.fetch injects tollway options automatically', async () => {
    const origin = uniqueOrigin();
    mockFetch
      .mockResolvedValueOnce(makeResponse('', 404))
      .mockResolvedValueOnce(makeResponse(MOCK_HTML));

    const agent = createAgent(BASE_OPTS);
    await agent.fetch(`${origin}/`);

    const headers = mockFetch.mock.calls[1]![1]?.headers as Record<string, string>;
    expect(headers['X-Tollway-DID']).toBe(BASE_DID);
  });

  test('agent.fetch merges caller-supplied headers with identity headers', async () => {
    const origin = uniqueOrigin();
    mockFetch
      .mockResolvedValueOnce(makeResponse('', 404))
      .mockResolvedValueOnce(makeResponse(MOCK_HTML));

    const agent = createAgent(BASE_OPTS);
    await agent.fetch(`${origin}/`, { headers: { 'X-Custom': 'value' } });

    const headers = mockFetch.mock.calls[1]![1]?.headers as Record<string, string>;
    expect(headers['X-Custom']).toBe('value');
    expect(headers['X-Tollway-DID']).toBe(BASE_DID);
  });

  test('agent.checkPolicy resolves the policy for a given URL', async () => {
    const origin = uniqueOrigin();
    const policy = { version: '0.1', data_policy: { training_allowed: false } };
    mockFetch.mockResolvedValueOnce(makeResponse(JSON.stringify(policy), 200, 'application/json'));

    const agent = createAgent(BASE_OPTS);
    const result = await agent.checkPolicy(`${origin}/some/page`);

    expect(mockFetch.mock.calls[0]![0]).toContain('tollway.json');
    expect(result?.version).toBe('0.1');
  });

  test('agent.checkPolicy returns null when no policy exists', async () => {
    const origin = uniqueOrigin();
    mockFetch.mockResolvedValueOnce(makeResponse('', 404));

    const agent = createAgent(BASE_OPTS);
    const result = await agent.checkPolicy(`${origin}/`);

    expect(result).toBeNull();
  });
});

// ─── getReputation ────────────────────────────────────────────────────────────

describe('getReputation', () => {
  test('returns reputation data on success', async () => {
    const data = { score: 0.95, observations: 1234, flags: [] };
    mockFetch.mockResolvedValueOnce(makeResponse(JSON.stringify(data), 200, 'application/json'));

    const result = await getReputation(BASE_DID);

    expect(result?.score).toBe(0.95);
    expect(result?.observations).toBe(1234);
    expect(result?.flags).toEqual([]);
  });

  test('returns null on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse('Not found', 404));

    const result = await getReputation(BASE_DID);

    expect(result).toBeNull();
  });

  test('returns null on network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const result = await getReputation(BASE_DID);

    expect(result).toBeNull();
  });

  test('uses the default oracle URL', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse('', 404));

    await getReputation(BASE_DID);

    expect(String(mockFetch.mock.calls[0]![0])).toContain('reputation.tollway.dev');
  });

  test('uses a custom oracle URL when provided', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse('', 404));

    await getReputation(BASE_DID, 'https://my-oracle.example.com/v2');

    expect(String(mockFetch.mock.calls[0]![0])).toContain('my-oracle.example.com');
  });

  test('URL-encodes the DID in the oracle request', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse('', 404));

    await getReputation('did:key:z6Mk+special/chars');

    const url = String(mockFetch.mock.calls[0]![0]);
    expect(url).not.toContain('+');
    expect(url).not.toContain('/chars');
  });
});

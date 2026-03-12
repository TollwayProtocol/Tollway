/**
 * @tollway/client v0.1.0
 * Drop-in fetch replacement for AI agents.
 * Handles Tollway identity headers, payment flows, and structured extraction.
 */

import * as crypto from 'crypto';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TollwayOptions {
  /** Agent's Decentralized Identifier (DID) */
  did: string;
  /** Ed25519 private key as hex string for signing requests */
  privateKey: string;
  /** Agent wallet address for payments (optional) */
  wallet?: string;
  /** Human-readable purpose for this request */
  purpose: string;
  /** Action scope: read | search | summarize | train | scrape_bulk */
  scope: 'read' | 'search' | 'summarize' | 'train' | 'scrape_bulk';
  /** Principal DID (operator identity, if different from agent) */
  principalDid?: string;
  /** Maximum price willing to pay per request, in USDC */
  maxPriceUsdc?: string;
  /** Reputation oracle URL */
  reputationOracle?: string;
  /** Agent framework identifier e.g. "langchain/0.3.0" */
  framework?: string;
  /**
   * Custom payment handler invoked when the server returns HTTP 402.
   * Should submit an on-chain USDC transfer and return a JSON receipt string,
   * or null to skip payment. Use @tollway/payments for a ready-made handler.
   */
  onPaymentRequired?: (req: PaymentRequest) => Promise<string | null>;
}

export interface TollwayResult {
  /** HTTP status code */
  status: number;
  /** Raw response text */
  text: string;
  /** Structured data if a schema was available */
  data: Record<string, unknown> | null;
  /** Attribution string as required by the site */
  attribution: string | null;
  /** Whether a payment was made for this request */
  paid: boolean;
  /** Amount paid in USDC, if any */
  cost: string | null;
  /** The site's tollway.json policy, if found */
  policy: TollwayPolicy | null;
  /** Raw Response object */
  response: Response;
}

export interface TollwayPolicy {
  version: string;
  identity?: {
    require_did?: boolean;
    minimum_reputation?: number;
    allowed_principals?: string[];
    blocked_principals?: string[];
  };
  pricing?: {
    currency?: string;
    default_per_request?: string;
    free_requests_per_day?: number;
    schedule?: Array<{ action: string; price: string }>;
  };
  data_policy?: {
    cache_allowed?: boolean;
    cache_ttl_seconds?: number;
    training_allowed?: boolean;
    attribution_required?: boolean;
    attribution_format?: string;
  };
  rate_limits?: {
    requests_per_minute?: number;
    requests_per_day?: number;
  };
  actions?: {
    allowed?: string[];
    prohibited?: string[];
    require_payment?: string[];
  };
  endpoints?: {
    agent_api?: string;
    schema_url?: string;
    payment_address?: string;
  };
}

export interface PaymentRequest {
  tollway_version: string;
  price: string;
  currency: string;
  network: string;
  payment_address: string;
  payment_id: string;
  expires_at: string;
  memo: string;
}

// ─── Policy Cache ─────────────────────────────────────────────────────────────

const policyCache = new Map<string, { policy: TollwayPolicy; fetchedAt: number }>();
const POLICY_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function fetchPolicy(origin: string): Promise<TollwayPolicy | null> {
  const cached = policyCache.get(origin);
  if (cached && Date.now() - cached.fetchedAt < POLICY_CACHE_TTL_MS) {
    return cached.policy;
  }

  try {
    const res = await globalThis.fetch(`${origin}/.well-known/tollway.json`, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const policy = await res.json() as TollwayPolicy;
    policyCache.set(origin, { policy, fetchedAt: Date.now() });
    return policy;
  } catch {
    return null;
  }
}

// ─── Signing ──────────────────────────────────────────────────────────────────

function buildCanonicalString(
  did: string,
  purpose: string,
  scope: string,
  nonce: string,
  timestamp: string,
  method: string,
  url: string,
): string {
  return [did, purpose, scope, nonce, timestamp, method, url].join('\n');
}

function signRequest(privateKeyHex: string, canonical: string): string {
  // Ed25519 signing
  const privateKey = Buffer.from(privateKeyHex, 'hex');
  const keyObj = crypto.createPrivateKey({
    key: Buffer.concat([
      Buffer.from('302e020100300506032b657004220420', 'hex'),
      privateKey,
    ]),
    format: 'der',
    type: 'pkcs8',
  });
  const signature = crypto.sign(null, Buffer.from(canonical, 'utf8'), keyObj);
  return signature.toString('base64url');
}

function buildIdentityHeaders(
  options: TollwayOptions,
  method: string,
  url: string,
): Record<string, string> {
  const nonce = crypto.randomUUID();
  const timestamp = new Date().toISOString();

  const canonical = buildCanonicalString(
    options.did,
    options.purpose,
    options.scope,
    nonce,
    timestamp,
    method.toUpperCase(),
    url,
  );

  let signature = '';
  try {
    signature = signRequest(options.privateKey, canonical);
  } catch {
    // If key format fails, we still send headers without signature
    // Server will handle accordingly
    console.warn('[tollway] Could not sign request — sending unsigned');
  }

  const headers: Record<string, string> = {
    'X-Tollway-Version': '0.1',
    'X-Tollway-DID': options.did,
    'X-Tollway-Purpose': options.purpose,
    'X-Tollway-Scope': options.scope,
    'X-Tollway-Nonce': nonce,
    'X-Tollway-Timestamp': timestamp,
  };

  if (signature) headers['X-Tollway-Signature'] = signature;
  if (options.principalDid) headers['X-Tollway-Principal'] = options.principalDid;
  if (options.wallet) headers['X-Tollway-Wallet'] = options.wallet;
  if (options.reputationOracle) headers['X-Tollway-Reputation-Oracle'] = options.reputationOracle;
  if (options.framework) headers['X-Tollway-Framework'] = options.framework;

  return headers;
}

// ─── Payment Handling ─────────────────────────────────────────────────────────

async function handlePayment(
  paymentReq: PaymentRequest,
  options: TollwayOptions,
): Promise<string | null> {
  // Use the caller-supplied payment handler if provided (e.g. from @tollway/payments)
  if (options.onPaymentRequired) {
    return options.onPaymentRequired(paymentReq);
  }

  if (!options.wallet) {
    console.warn('[tollway] Payment required but no wallet or onPaymentRequired configured');
    return null;
  }

  const price = parseFloat(paymentReq.price);
  const maxPrice = parseFloat(options.maxPriceUsdc ?? '0.01');

  if (price > maxPrice) {
    console.warn(`[tollway] Price ${price} USDC exceeds max ${maxPrice} USDC — skipping`);
    return null;
  }

  // No payment handler supplied — log and bail
  console.warn('[tollway] Payment required. Add onPaymentRequired from @tollway/payments to pay automatically.');
  console.log(`[tollway] Would pay ${price} ${paymentReq.currency} to ${paymentReq.payment_address}`);
  return null;
}

// ─── Attribution ──────────────────────────────────────────────────────────────

function buildAttribution(url: string, policy: TollwayPolicy | null, title?: string): string | null {
  if (!policy?.data_policy?.attribution_required) return null;

  const format = policy.data_policy.attribution_format ?? '{title} ({url})';
  return format
    .replace('{title}', title ?? new URL(url).hostname)
    .replace('{url}', url);
}

// ─── Structured Extraction ────────────────────────────────────────────────────

async function extractStructured(
  html: string,
  url: string,
  schemaUrl?: string,
): Promise<Record<string, unknown> | null> {
  // Phase 1: Try schema-based extraction if schemaUrl provided
  if (schemaUrl) {
    try {
      const schemaRes = await globalThis.fetch(schemaUrl);
      if (schemaRes.ok) {
        // TODO: Parse YAML schema and apply CSS selectors
        // Requires a YAML parser and DOM parser (e.g. parse5 server-side)
      }
    } catch {
      // Schema fetch failed, fall through
    }
  }

  // Phase 2: Basic metadata extraction from HTML
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const descMatch = html.match(/<meta[^>]+name="description"[^>]+content="([^"]+)"/i);
  const ogTitleMatch = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i);
  const ogDescMatch = html.match(/<meta[^>]+property="og:description"[^>]+content="([^"]+)"/i);
  const canonicalMatch = html.match(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/i);

  const title = ogTitleMatch?.[1] ?? titleMatch?.[1] ?? null;
  const description = ogDescMatch?.[1] ?? descMatch?.[1] ?? null;

  if (!title && !description) return null;

  return {
    url: canonicalMatch?.[1] ?? url,
    title,
    description,
    domain: new URL(url).hostname,
  };
}

// ─── Main Fetch Function ───────────────────────────────────────────────────────

export async function fetch(
  input: string | URL,
  init?: RequestInit & { tollway?: TollwayOptions },
): Promise<TollwayResult> {
  const url = input.toString();
  const method = (init?.method ?? 'GET').toUpperCase();
  const tollwayOpts = init?.tollway;

  const origin = new URL(url).origin;

  // Fetch site policy
  const policy = await fetchPolicy(origin);

  // Check if action is prohibited
  if (tollwayOpts && policy?.actions?.prohibited?.includes(tollwayOpts.scope)) {
    throw new Error(`[tollway] Action "${tollwayOpts.scope}" is prohibited by ${origin}`);
  }

  // Build headers
  const identityHeaders = tollwayOpts
    ? buildIdentityHeaders(tollwayOpts, method, url)
    : {};

  const requestHeaders = {
    ...(init?.headers as Record<string, string> ?? {}),
    ...identityHeaders,
  };

  // Initial request
  const { tollway: _tollway, ...fetchInit } = init ?? {};
  let response = await globalThis.fetch(url, {
    ...fetchInit,
    headers: requestHeaders,
  });

  let paid = false;
  let cost: string | null = null;

  // Handle 402 Payment Required
  if (response.status === 402 && tollwayOpts) {
    let paymentReq: PaymentRequest | null = null;
    try {
      paymentReq = await response.json() as PaymentRequest;
    } catch {
      // Not a Tollway 402 response
    }

    if (paymentReq && tollwayOpts.wallet) {
      const paymentProof = await handlePayment(paymentReq, tollwayOpts);
      if (paymentProof) {
        // Retry with payment proof
        response = await globalThis.fetch(url, {
          ...fetchInit,
          headers: {
            ...requestHeaders,
            'X-Tollway-Payment': paymentProof,
          },
        });
        if (response.ok) {
          paid = true;
          cost = paymentReq.price;
        }
      }
    }
  }

  // Parse response
  const text = await response.text();
  const isHtml = response.headers.get('content-type')?.includes('text/html') ?? false;

  const data = isHtml
    ? await extractStructured(text, url, policy?.endpoints?.schema_url)
    : null;

  const title = (data?.title as string) ?? undefined;
  const attribution = buildAttribution(url, policy, title);

  return {
    status: response.status,
    text,
    data,
    attribution,
    paid,
    cost,
    policy,
    response,
  };
}

// ─── Agent Identity Factory ────────────────────────────────────────────────────

export function createAgent(options: TollwayOptions) {
  return {
    fetch: (input: string | URL, init?: RequestInit) =>
      fetch(input, { ...init, tollway: options }),

    options,

    /** Check a site's policy before fetching */
    checkPolicy: (url: string) => fetchPolicy(new URL(url).origin),
  };
}

// ─── Reputation ────────────────────────────────────────────────────────────────

export async function getReputation(
  did: string,
  oracle = 'https://reputation.tollway.dev/v1',
): Promise<{ score: number; observations: number; flags: string[] } | null> {
  try {
    const res = await globalThis.fetch(`${oracle}/${encodeURIComponent(did)}`);
    if (!res.ok) return null;
    return await res.json() as { score: number; observations: number; flags: string[] };
  } catch {
    return null;
  }
}

export default { fetch, createAgent, getReputation };

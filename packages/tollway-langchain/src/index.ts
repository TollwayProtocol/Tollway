/**
 * @tollway/langchain
 * LangChain integration for the Tollway protocol.
 *
 * Provides TollwayRetriever — a drop-in BaseRetriever that fetches web content
 * through the Tollway protocol, handling identity, policy, and payment flows
 * automatically.
 */

import { BaseRetriever, type BaseRetrieverInput } from '@langchain/core/retrievers';
import { Document } from '@langchain/core/documents';
import { CallbackManagerForRetrieverRun } from '@langchain/core/callbacks/manager';
import { fetch as tollwayFetch, createAgent, type TollwayOptions, type TollwayResult } from '@tollway/client';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TollwayRetrieverOptions extends BaseRetrieverInput {
  /** Agent's Decentralized Identifier */
  did: string;
  /** Ed25519 private key as hex string */
  privateKey: string;
  /** Agent wallet address for automatic payments */
  wallet?: string;
  /** Human-readable purpose for requests */
  purpose?: string;
  /** Action scope */
  scope?: TollwayOptions['scope'];
  /** Maximum price per request in USDC (default: "0.01") */
  maxPriceUsdc?: string;
  /** Reputation oracle URL */
  reputationOracle?: string;
  /** Custom payment handler */
  onPaymentRequired?: TollwayOptions['onPaymentRequired'];
  /**
   * URL(s) to retrieve. Can be set at construction time for fixed sources,
   * or passed per-query via the query string (treated as a URL if it starts
   * with http:// or https://).
   */
  urls?: string[];
}

// ─── TollwayRetriever ─────────────────────────────────────────────────────────

/**
 * LangChain retriever that fetches documents from the web via the Tollway
 * protocol. Automatically handles agent identity headers, site policy checks,
 * and USDC micropayment flows.
 *
 * @example
 * ```typescript
 * import { TollwayRetriever } from '@tollway/langchain';
 *
 * const retriever = new TollwayRetriever({
 *   did: process.env.AGENT_DID,
 *   privateKey: process.env.AGENT_PRIVATE_KEY,
 *   wallet: process.env.AGENT_WALLET,
 *   purpose: 'research',
 * });
 *
 * // Fetch by passing a URL as the query
 * const docs = await retriever.invoke('https://techcrunch.com/2026/01/01/example/');
 *
 * // Or configure fixed URLs at construction time
 * const fixedRetriever = new TollwayRetriever({
 *   did: process.env.AGENT_DID,
 *   privateKey: process.env.AGENT_PRIVATE_KEY,
 *   purpose: 'research',
 *   urls: ['https://example.com/article-1', 'https://example.com/article-2'],
 * });
 * const allDocs = await fixedRetriever.invoke('');
 * ```
 */
export class TollwayRetriever extends BaseRetriever {
  static lc_name() { return 'TollwayRetriever'; }

  lc_namespace = ['tollway', 'retrievers'];

  private readonly tollwayOptions: TollwayOptions;
  private readonly urls: string[];
  private readonly agent: ReturnType<typeof createAgent>;

  constructor(options: TollwayRetrieverOptions) {
    const { did, privateKey, wallet, purpose, scope, maxPriceUsdc,
            reputationOracle, onPaymentRequired, urls, ...baseOptions } = options;

    super(baseOptions);

    this.tollwayOptions = {
      did,
      privateKey,
      wallet,
      purpose: purpose ?? 'langchain-retrieval',
      scope: scope ?? 'read',
      maxPriceUsdc: maxPriceUsdc ?? '0.01',
      reputationOracle,
      onPaymentRequired,
      framework: 'langchain',
    };

    this.urls = urls ?? [];
    this.agent = createAgent(this.tollwayOptions);
  }

  async _getRelevantDocuments(
    query: string,
    runManager?: CallbackManagerForRetrieverRun,
  ): Promise<Document[]> {
    // If query looks like a URL, treat it as such; otherwise use configured URLs
    const targets = isUrl(query)
      ? [query]
      : this.urls;

    if (targets.length === 0) {
      throw new Error(
        '[TollwayRetriever] No URLs to fetch. Either pass a URL as the query or set urls in the constructor.',
      );
    }

    const results = await Promise.allSettled(
      targets.map(url => this.fetchDocument(url, runManager)),
    );

    const docs: Document[] = [];
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        docs.push(result.value);
      } else if (result.status === 'rejected') {
        runManager?.handleRetrieverError(result.reason);
      }
    }

    return docs;
  }

  private async fetchDocument(
    url: string,
    runManager?: CallbackManagerForRetrieverRun,
  ): Promise<Document | null> {
    let result: TollwayResult;
    try {
      result = await this.agent.fetch(url);
    } catch (err) {
      runManager?.handleRetrieverError(err instanceof Error ? err : new Error(String(err)));
      return null;
    }

    if (!result.text) return null;

    const pageContent = result.data
      ? JSON.stringify(result.data, null, 2)
      : result.text;

    return new Document({
      pageContent,
      metadata: {
        source: url,
        tollway_paid: result.paid,
        tollway_cost: result.cost,
        tollway_attribution: result.attribution,
        tollway_policy_version: result.policy?.version ?? null,
        ...(result.data ? { structured: true, ...flattenMetadata(result.data) } : {}),
      },
    });
  }
}

// ─── TollwayLoader ────────────────────────────────────────────────────────────

/**
 * Convenience document loader that fetches a fixed list of URLs via Tollway.
 * Useful when you want to load-and-split rather than retrieve.
 *
 * @example
 * ```typescript
 * import { TollwayLoader } from '@tollway/langchain';
 * import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
 *
 * const loader = new TollwayLoader({
 *   did: process.env.AGENT_DID,
 *   privateKey: process.env.AGENT_PRIVATE_KEY,
 *   urls: ['https://example.com/page-1', 'https://example.com/page-2'],
 * });
 *
 * const docs = await loader.load();
 * ```
 */
export class TollwayLoader {
  private readonly retriever: TollwayRetriever;
  private readonly urls: string[];

  constructor(options: TollwayRetrieverOptions & { urls: string[] }) {
    this.urls = options.urls;
    this.retriever = new TollwayRetriever(options);
  }

  async load(): Promise<Document[]> {
    const results = await Promise.allSettled(
      this.urls.map(url => this.retriever.invoke(url)),
    );

    const docs: Document[] = [];
    for (const result of results) {
      if (result.status === 'fulfilled') {
        docs.push(...result.value);
      }
    }
    return docs;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isUrl(str: string): boolean {
  return str.startsWith('http://') || str.startsWith('https://');
}

function flattenMetadata(data: Record<string, unknown>): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(data)) {
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      out[k] = v;
    } else if (v !== null && v !== undefined) {
      out[k] = String(v);
    }
  }
  return out;
}

export { type TollwayOptions } from '@tollway/client';

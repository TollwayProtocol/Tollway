/**
 * @tollway/llamaindex
 * LlamaIndex integration for the Tollway protocol.
 *
 * Provides TollwayReader — a BaseReader that loads web content through the
 * Tollway protocol, handling identity, policy, and payment flows automatically.
 */

import { Document, BaseReader, Metadata } from 'llamaindex';
import { fetch as tollwayFetch, createAgent, type TollwayOptions, type TollwayResult } from '@tollway/client';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TollwayReaderOptions {
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
}

// ─── TollwayReader ────────────────────────────────────────────────────────────

/**
 * LlamaIndex reader that loads documents from the web via the Tollway protocol.
 * Automatically handles agent identity headers, site policy checks, and USDC
 * micropayment flows.
 *
 * @example
 * ```typescript
 * import { TollwayReader } from '@tollway/llamaindex';
 *
 * const reader = new TollwayReader({
 *   did: process.env.AGENT_DID!,
 *   privateKey: process.env.AGENT_PRIVATE_KEY!,
 *   wallet: process.env.AGENT_WALLET,
 *   purpose: 'research',
 * });
 *
 * // Load one or more URLs
 * const docs = await reader.loadData([
 *   'https://techcrunch.com/2026/01/01/example/',
 *   'https://arxiv.org/abs/2401.00000',
 * ]);
 *
 * console.log(docs[0].text);
 * console.log(docs[0].metadata.tollway_paid);
 * ```
 */
export class TollwayReader implements BaseReader<Document<Metadata>> {
  private readonly agent: ReturnType<typeof createAgent>;

  constructor(options: TollwayReaderOptions) {
    this.agent = createAgent({
      did: options.did,
      privateKey: options.privateKey,
      wallet: options.wallet,
      purpose: options.purpose ?? 'llamaindex-reader',
      scope: options.scope ?? 'read',
      maxPriceUsdc: options.maxPriceUsdc ?? '0.01',
      reputationOracle: options.reputationOracle,
      onPaymentRequired: options.onPaymentRequired,
      framework: 'llamaindex',
    });
  }

  /**
   * Load documents from one or more URLs.
   *
   * @param urls - URLs to fetch
   * @returns Array of LlamaIndex Documents, one per successfully fetched URL
   */
  async loadData(urls: string[]): Promise<Document<Metadata>[]> {
    const results = await Promise.allSettled(
      urls.map(url => this.fetchDocument(url)),
    );

    const docs: Document<Metadata>[] = [];
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        docs.push(result.value);
      } else if (result.status === 'rejected') {
        console.warn('[TollwayReader]', result.reason);
      }
    }

    return docs;
  }

  private async fetchDocument(url: string): Promise<Document<Metadata> | null> {
    let result: TollwayResult;
    try {
      result = await this.agent.fetch(url);
    } catch (err) {
      console.warn(`[TollwayReader] Failed to fetch ${url}:`, err);
      return null;
    }

    if (!result.text) return null;

    // If schema extraction produced structured data, serialize it as the text;
    // otherwise use the raw HTML/text response.
    const text = result.data
      ? JSON.stringify(result.data, null, 2)
      : result.text;

    const metadata: Metadata = {
      source: url,
      tollway_paid: result.paid,
      tollway_cost: result.cost ?? undefined,
      tollway_attribution: result.attribution ?? undefined,
      tollway_policy_version: result.policy?.version ?? undefined,
    };

    // Promote top-level string/number fields from structured data into metadata
    if (result.data) {
      for (const [k, v] of Object.entries(result.data)) {
        if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
          metadata[k] = v;
        }
      }
    }

    return new Document({ text, metadata });
  }
}

export { type TollwayOptions } from '@tollway/client';

/**
 * @tollway/payments
 * USDC micropayment handler for the Tollway protocol.
 * Sends on-chain USDC transfers on Base (or Base Sepolia testnet) via viem.
 */

import {
  createWalletClient,
  createPublicClient,
  http,
  parseUnits,
  type Chain,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base, baseSepolia } from 'viem/chains';
import type { PaymentRequest } from '@tollway/client';

// ─── USDC Contract Addresses ──────────────────────────────────────────────────

const USDC_ADDRESS: Record<string, `0x${string}`> = {
  base: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  'base-sepolia': '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
};

// Minimal ERC-20 ABI for transfer
const ERC20_ABI = [
  {
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'decimals',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
] as const;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PaymentHandlerOptions {
  /** Private key for the paying wallet (hex, with or without 0x prefix) */
  walletPrivateKey: string;
  /** Max price per payment in USDC (default: 0.01) */
  maxPriceUsdc?: string;
  /** RPC URL override (uses public Base RPC by default) */
  rpcUrl?: string;
}

export interface PaymentReceipt {
  tx_hash: string;
  network: string;
  payment_id: string;
  amount: string;
  currency: string;
}

// ─── Payment Handler Factory ──────────────────────────────────────────────────

/**
 * Creates a payment handler compatible with @tollway/client's onPaymentRequired callback.
 *
 * @example
 * ```ts
 * import { createPaymentHandler } from '@tollway/payments';
 * import { createAgent } from '@tollway/client';
 *
 * const agent = createAgent({
 *   did: process.env.AGENT_DID,
 *   privateKey: process.env.AGENT_KEY,
 *   purpose: 'Research',
 *   scope: 'read',
 *   onPaymentRequired: createPaymentHandler({
 *     walletPrivateKey: process.env.WALLET_PRIVATE_KEY,
 *   }),
 * });
 * ```
 */
export function createPaymentHandler(
  opts: PaymentHandlerOptions,
): (req: PaymentRequest) => Promise<string | null> {
  const maxPrice = parseFloat(opts.maxPriceUsdc ?? '0.01');

  // Normalize private key to 0x-prefixed hex
  const rawKey = opts.walletPrivateKey.startsWith('0x')
    ? opts.walletPrivateKey
    : `0x${opts.walletPrivateKey}`;
  const account = privateKeyToAccount(rawKey as `0x${string}`);

  return async (req: PaymentRequest): Promise<string | null> => {
    // Price guard
    const price = parseFloat(req.price);
    if (price > maxPrice) {
      console.warn(`[tollway/payments] Price ${price} ${req.currency} exceeds max ${maxPrice} — skipping`);
      return null;
    }

    // Only handle USDC
    if (req.currency.toUpperCase() !== 'USDC') {
      console.warn(`[tollway/payments] Unsupported currency: ${req.currency}`);
      return null;
    }

    // Resolve chain
    const networkKey = req.network.toLowerCase();
    const chain: Chain = networkKey === 'base-sepolia' || networkKey === 'sepolia'
      ? baseSepolia
      : base;

    const usdcAddress = USDC_ADDRESS[
      networkKey === 'base-sepolia' || networkKey === 'sepolia' ? 'base-sepolia' : 'base'
    ];

    if (!usdcAddress) {
      console.warn(`[tollway/payments] No USDC contract known for network: ${req.network}`);
      return null;
    }

    const rpcUrl = opts.rpcUrl ?? (chain === baseSepolia
      ? 'https://sepolia.base.org'
      : 'https://mainnet.base.org');

    const transport = http(rpcUrl);

    const walletClient = createWalletClient({ account, chain, transport });
    const publicClient = createPublicClient({ chain, transport });

    // Parse amount — USDC has 6 decimals
    const amountRaw = parseUnits(req.price, 6);

    let txHash: `0x${string}`;
    try {
      txHash = await walletClient.writeContract({
        address: usdcAddress,
        abi: ERC20_ABI,
        functionName: 'transfer',
        args: [req.payment_address as `0x${string}`, amountRaw],
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[tollway/payments] Transaction failed: ${message}`);
      return null;
    }

    // Wait for confirmation
    try {
      await publicClient.waitForTransactionReceipt({ hash: txHash });
    } catch {
      // Don't fail if receipt wait times out — tx may still land
      console.warn(`[tollway/payments] Could not confirm tx ${txHash} — it may still be pending`);
    }

    const receipt: PaymentReceipt = {
      tx_hash: txHash,
      network: req.network,
      payment_id: req.payment_id,
      amount: req.price,
      currency: req.currency,
    };

    console.log(`[tollway/payments] Paid ${req.price} ${req.currency} → ${txHash}`);
    return JSON.stringify(receipt);
  };
}

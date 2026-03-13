/**
 * Pure utility functions for @tollway/cli — isolated for testability.
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ─── Config ───────────────────────────────────────────────────────────────────

export const CONFIG_DIR = path.join(os.homedir(), '.tollway');
export const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

export interface TollwayConfig {
  did: string;
  privateKey: string;
  wallet?: string;
}

export function loadConfig(configFile = CONFIG_FILE): TollwayConfig | null {
  try {
    const raw = fs.readFileSync(configFile, 'utf8');
    return JSON.parse(raw) as TollwayConfig;
  } catch {
    return null;
  }
}

export function saveConfig(config: TollwayConfig, configFile = CONFIG_FILE): void {
  fs.mkdirSync(path.dirname(configFile), { recursive: true });
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2), {
    mode: 0o600,
  });
}

// ─── Base58 ───────────────────────────────────────────────────────────────────

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export function base58Encode(bytes: Uint8Array): string {
  let num = BigInt('0x' + Buffer.from(bytes).toString('hex'));
  const base = BigInt(58);
  const result: string[] = [];

  while (num > 0n) {
    result.unshift(BASE58_ALPHABET[Number(num % base)]);
    num = num / base;
  }

  for (const byte of bytes) {
    if (byte === 0) result.unshift('1');
    else break;
  }

  return result.join('');
}

// ─── DID Key Generation ───────────────────────────────────────────────────────

export interface KeyPair {
  did: string;
  privateKeyHex: string;
  publicKeyHex: string;
}

export function generateDidKeyPair(): KeyPair {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519', {
    privateKeyEncoding: { type: 'pkcs8', format: 'der' },
    publicKeyEncoding: { type: 'spki', format: 'der' },
  });

  // Ed25519 PKCS8: last 32 bytes are private key
  // Ed25519 SPKI: last 32 bytes are public key
  const rawPrivate = privateKey.subarray(privateKey.length - 32);
  const rawPublic = publicKey.subarray(publicKey.length - 32);

  // did:key with multicodec prefix 0xed01 (Ed25519)
  const multicodecKey = new Uint8Array([0xed, 0x01, ...rawPublic]);
  const did = `did:key:z${base58Encode(multicodecKey)}`;

  return {
    did,
    privateKeyHex: rawPrivate.toString('hex'),
    publicKeyHex: rawPublic.toString('hex'),
  };
}

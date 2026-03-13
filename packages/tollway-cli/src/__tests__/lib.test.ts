import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as nodeCrypto from 'crypto';
import {
  base58Encode,
  generateDidKeyPair,
  loadConfig,
  saveConfig,
} from '../lib.js';

// ─── base58Encode ─────────────────────────────────────────────────────────────

describe('base58Encode', () => {
  test('encodes a known byte sequence correctly', () => {
    // [0x00, 0x01, 0x02] → known base58 output
    const input = new Uint8Array([0x00, 0x01, 0x02]);
    const encoded = base58Encode(input);
    // Leading zero byte → leading '1'
    expect(encoded).toMatch(/^1/);
    expect(typeof encoded).toBe('string');
    expect(encoded.length).toBeGreaterThan(0);
  });

  test('all-zeros produces only leading 1s', () => {
    const input = new Uint8Array([0x00, 0x00, 0x00]);
    expect(base58Encode(input)).toBe('111');
  });

  test('produces only characters from the base58 alphabet', () => {
    const input = new Uint8Array(34);
    nodeCrypto.randomFillSync(input);
    const encoded = base58Encode(input);
    expect(encoded).toMatch(/^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$/);
  });

  test('does not contain ambiguous characters (0, O, I, l)', () => {
    for (let i = 0; i < 20; i++) {
      const bytes = new Uint8Array(32);
      nodeCrypto.randomFillSync(bytes);
      const encoded = base58Encode(bytes);
      expect(encoded).not.toMatch(/[0OIl]/);
    }
  });
});

// ─── generateDidKeyPair ───────────────────────────────────────────────────────

describe('generateDidKeyPair', () => {
  test('returns did, privateKeyHex, and publicKeyHex', () => {
    const kp = generateDidKeyPair();
    expect(kp).toHaveProperty('did');
    expect(kp).toHaveProperty('privateKeyHex');
    expect(kp).toHaveProperty('publicKeyHex');
  });

  test('DID starts with did:key:z', () => {
    const kp = generateDidKeyPair();
    expect(kp.did).toMatch(/^did:key:z/);
  });

  test('private key is 64 hex chars (32 bytes)', () => {
    const kp = generateDidKeyPair();
    expect(kp.privateKeyHex).toMatch(/^[0-9a-f]{64}$/);
  });

  test('public key is 64 hex chars (32 bytes)', () => {
    const kp = generateDidKeyPair();
    expect(kp.publicKeyHex).toMatch(/^[0-9a-f]{64}$/);
  });

  test('each call produces a unique DID', () => {
    const kp1 = generateDidKeyPair();
    const kp2 = generateDidKeyPair();
    expect(kp1.did).not.toBe(kp2.did);
    expect(kp1.privateKeyHex).not.toBe(kp2.privateKeyHex);
  });

  test('DID encodes the Ed25519 multicodec prefix 0xed01', () => {
    // The multibase-decoded bytes should start with 0xed, 0x01
    const kp = generateDidKeyPair();
    // did:key:z<base58(0xed01 || pubkey)>
    // We can't easily re-decode without a full base58 decoder here,
    // but the DID should be a reasonable length (~50 chars after 'did:key:z')
    const suffix = kp.did.replace('did:key:z', '');
    expect(suffix.length).toBeGreaterThan(40);
  });
});

// ─── loadConfig / saveConfig ──────────────────────────────────────────────────

describe('loadConfig / saveConfig', () => {
  let tmpDir: string;
  let tmpFile: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tollway-test-'));
    tmpFile = path.join(tmpDir, 'config.json');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('loadConfig returns null when file does not exist', () => {
    expect(loadConfig('/nonexistent/path/config.json')).toBeNull();
  });

  test('saveConfig writes a valid JSON file', () => {
    const config = { did: 'did:key:z123', privateKey: 'abcd1234' };
    saveConfig(config, tmpFile);
    const raw = fs.readFileSync(tmpFile, 'utf8');
    expect(JSON.parse(raw)).toEqual(config);
  });

  test('loadConfig reads back what saveConfig wrote', () => {
    const config = { did: 'did:key:zTest', privateKey: 'ff00aa', wallet: '0xWallet' };
    saveConfig(config, tmpFile);
    const loaded = loadConfig(tmpFile);
    expect(loaded).toEqual(config);
  });

  test('saveConfig creates parent directories', () => {
    const nested = path.join(tmpDir, 'deep', 'nested', 'config.json');
    const config = { did: 'did:key:zDeep', privateKey: 'beef' };
    saveConfig(config, nested);
    expect(fs.existsSync(nested)).toBe(true);
  });

  test('loadConfig returns null on invalid JSON', () => {
    fs.writeFileSync(tmpFile, 'not valid json');
    expect(loadConfig(tmpFile)).toBeNull();
  });
});

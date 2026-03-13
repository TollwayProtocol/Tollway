/**
 * @tollway/cli — Tollway protocol CLI
 *
 * Commands:
 *   tollway init              Generate a new DID + Ed25519 key pair
 *   tollway fetch <url>       Fetch a URL with Tollway identity headers
 *   tollway policy <url>      Inspect a site's tollway.json policy
 *   tollway id                Show the current saved identity
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { fetch as tollwayFetch, getReputation } from '@tollway/client';
import {
  CONFIG_FILE,
  loadConfig,
  saveConfig,
  generateDidKeyPair,
  type TollwayConfig,
} from './lib.js';

// ─── Formatting ───────────────────────────────────────────────────────────────

function printHeader(title: string): void {
  console.log('');
  console.log(chalk.bold.cyan(`  ◈ ${title}`));
  console.log(chalk.dim('  ' + '─'.repeat(50)));
}

function printField(label: string, value: string | number | boolean | null | undefined): void {
  if (value === null || value === undefined) return;
  const strVal = String(value);
  console.log(`  ${chalk.dim(label.padEnd(22))} ${chalk.white(strVal)}`);
}

function printJson(obj: unknown): void {
  console.log(JSON.stringify(obj, null, 2));
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

const program = new Command();

program
  .name('tollway')
  .description('Tollway protocol CLI — robots.txt rebuilt for the agentic era')
  .version('0.1.0');

// ─── init ─────────────────────────────────────────────────────────────────────

program
  .command('init')
  .description('Generate a new DID + Ed25519 key pair and save to ~/.tollway/config.json')
  .option('--wallet <address>', 'Associate a USDC wallet address with this identity')
  .option('--force', 'Overwrite existing config')
  .action((opts: { wallet?: string; force?: boolean }) => {
    const existing = loadConfig();
    if (existing && !opts.force) {
      console.error(chalk.yellow('\n  Identity already exists. Use --force to regenerate.\n'));
      console.log(`  DID: ${chalk.cyan(existing.did)}`);
      console.log(`  Config: ${chalk.dim(CONFIG_FILE)}\n`);
      process.exit(1);
    }

    const kp = generateDidKeyPair();
    const config: TollwayConfig = {
      did: kp.did,
      privateKey: kp.privateKeyHex,
      ...(opts.wallet ? { wallet: opts.wallet } : {}),
    };
    saveConfig(config);

    printHeader('New Tollway Identity');
    printField('DID', kp.did);
    printField('Public key', kp.publicKeyHex);
    printField('Config saved', CONFIG_FILE);
    if (opts.wallet) printField('Wallet', opts.wallet);
    console.log('');
    console.log(chalk.dim('  Your private key is stored in ~/.tollway/config.json'));
    console.log(chalk.dim('  Keep it safe — it signs all your agent requests.'));
    console.log('');
    console.log('  Next steps:');
    console.log(`    ${chalk.cyan('tollway fetch <url>')}    Make your first agent request`);
    console.log(`    ${chalk.cyan('tollway policy <url>')}   Inspect a site's tollway policy`);
    console.log('');
  });

// ─── id ───────────────────────────────────────────────────────────────────────

program
  .command('id')
  .description('Show the current saved identity')
  .option('--reputation', 'Fetch reputation score from the oracle')
  .action(async (opts: { reputation?: boolean }) => {
    const config = loadConfig();
    if (!config) {
      console.error(chalk.red('\n  No identity found. Run: tollway init\n'));
      process.exit(1);
    }

    printHeader('Tollway Identity');
    printField('DID', config.did);
    printField('Config', CONFIG_FILE);
    if (config.wallet) printField('Wallet', config.wallet);

    if (opts.reputation) {
      process.stdout.write('  ' + chalk.dim('Fetching reputation...'));
      const rep = await getReputation(config.did);
      process.stdout.write('\r' + ' '.repeat(40) + '\r');
      if (rep) {
        printField('Reputation score', rep.score);
        printField('Observations', rep.observations);
        if (rep.flags.length > 0) printField('Flags', rep.flags.join(', '));
      } else {
        printField('Reputation', 'Not found (new identity)');
      }
    }
    console.log('');
  });

// ─── policy ───────────────────────────────────────────────────────────────────

program
  .command('policy <url>')
  .description("Fetch and display a site's tollway.json policy")
  .option('--json', 'Output raw JSON')
  .action(async (url: string, opts: { json?: boolean }) => {
    // Normalize URL to origin for policy fetch
    let origin: string;
    try {
      origin = new URL(url).origin;
    } catch {
      console.error(chalk.red(`\n  Invalid URL: ${url}\n`));
      process.exit(1);
    }

    const policyUrl = `${origin}/.well-known/tollway.json`;

    let res: Response;
    try {
      res = await globalThis.fetch(policyUrl, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(5000),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(chalk.red(`\n  Failed to fetch policy: ${msg}\n`));
      process.exit(1);
    }

    if (res.status === 404) {
      console.log(chalk.yellow(`\n  No tollway.json found at ${origin}\n`));
      console.log(chalk.dim('  This site has not adopted the Tollway protocol.\n'));
      process.exit(0);
    }

    if (!res.ok) {
      console.error(chalk.red(`\n  HTTP ${res.status} from ${policyUrl}\n`));
      process.exit(1);
    }

    const policy = await res.json() as Record<string, unknown>;

    if (opts.json) {
      printJson(policy);
      return;
    }

    printHeader(`Policy — ${origin}`);

    const p = policy as {
      version?: string;
      pricing?: { currency?: string; free_requests_per_day?: number; default_per_request?: string; schedule?: Array<{ action: string; price: string }> };
      data_policy?: { training_allowed?: boolean; attribution_required?: boolean; cache_allowed?: boolean };
      actions?: { allowed?: string[]; prohibited?: string[]; require_payment?: string[] };
      rate_limits?: { requests_per_minute?: number; requests_per_day?: number };
      endpoints?: { payment_address?: string };
    };

    printField('Version', p.version);

    if (p.pricing) {
      printField('Currency', p.pricing.currency ?? 'USDC');
      printField('Free requests/day', p.pricing.free_requests_per_day);
      printField('Default price', p.pricing.default_per_request
        ? `${p.pricing.default_per_request} ${p.pricing.currency ?? 'USDC'}`
        : undefined);
      if (p.pricing.schedule?.length) {
        console.log(`  ${chalk.dim('Pricing schedule')}`);
        for (const item of p.pricing.schedule) {
          console.log(`    ${chalk.dim('•')} ${item.action.padEnd(14)} ${chalk.green(item.price)} USDC`);
        }
      }
    }

    if (p.data_policy) {
      printField('Training allowed', p.data_policy.training_allowed ? chalk.green('yes') : chalk.red('no'));
      printField('Attribution req.', p.data_policy.attribution_required ? chalk.yellow('yes') : 'no');
      printField('Cache allowed', p.data_policy.cache_allowed ? 'yes' : 'no');
    }

    if (p.actions) {
      if (p.actions.allowed?.length) printField('Allowed actions', p.actions.allowed.join(', '));
      if (p.actions.prohibited?.length) printField('Prohibited', chalk.red(p.actions.prohibited.join(', ')));
      if (p.actions.require_payment?.length) printField('Pay-to-use', p.actions.require_payment.join(', '));
    }

    if (p.rate_limits) {
      printField('Rate limit/min', p.rate_limits.requests_per_minute);
      printField('Rate limit/day', p.rate_limits.requests_per_day);
    }

    if (p.endpoints?.payment_address) {
      printField('Payment address', p.endpoints.payment_address);
    }

    console.log('');
  });

// ─── fetch ────────────────────────────────────────────────────────────────────

program
  .command('fetch <url>')
  .description('Fetch a URL with Tollway identity headers')
  .option('--purpose <text>', 'Human-readable purpose', 'CLI research request')
  .option('--scope <scope>', 'Action scope (read|search|summarize|train|scrape_bulk)', 'read')
  .option('--did <did>', 'Override DID (uses saved identity by default)')
  .option('--key <hex>', 'Override private key hex (uses saved identity by default)')
  .option('--json', 'Output full result as JSON')
  .option('--headers', 'Show request headers sent')
  .option('--text', 'Print the full response body')
  .action(async (url: string, opts: {
    purpose: string;
    scope: string;
    did?: string;
    key?: string;
    json?: boolean;
    headers?: boolean;
    text?: boolean;
  }) => {
    const config = loadConfig();
    const did = opts.did ?? config?.did;
    const privateKey = opts.key ?? config?.privateKey;

    if (!did || !privateKey) {
      console.error(chalk.red('\n  No identity found. Run: tollway init\n'));
      process.exit(1);
    }

    const validScopes = ['read', 'search', 'summarize', 'train', 'scrape_bulk'];
    if (!validScopes.includes(opts.scope)) {
      console.error(chalk.red(`\n  Invalid scope: ${opts.scope}`));
      console.error(chalk.dim(`  Valid scopes: ${validScopes.join(', ')}\n`));
      process.exit(1);
    }

    const tollwayOptions = {
      did,
      privateKey,
      purpose: opts.purpose,
      scope: opts.scope as 'read' | 'search' | 'summarize' | 'train' | 'scrape_bulk',
      wallet: config?.wallet,
    };

    if (opts.headers) {
      printHeader('Request Headers');
      // Show what headers would be sent (without signature for brevity)
      printField('X-Tollway-Version', '0.1');
      printField('X-Tollway-DID', did);
      printField('X-Tollway-Purpose', opts.purpose);
      printField('X-Tollway-Scope', opts.scope);
      printField('X-Tollway-Nonce', '<random UUID>');
      printField('X-Tollway-Timestamp', '<current ISO time>');
      printField('X-Tollway-Signature', '<Ed25519 signature>');
      console.log('');
    }

    let result;
    try {
      result = await tollwayFetch(url, { tollway: tollwayOptions });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(chalk.red(`\n  Fetch failed: ${msg}\n`));
      process.exit(1);
    }

    if (opts.json) {
      printJson({
        status: result.status,
        paid: result.paid,
        cost: result.cost,
        attribution: result.attribution,
        data: result.data,
        policy: result.policy,
        ...(opts.text ? { text: result.text } : {}),
      });
      return;
    }

    printHeader(`Fetch — ${url}`);
    printField('Status', result.status === 200 ? chalk.green(result.status) : chalk.yellow(result.status));
    if (result.paid) printField('Paid', chalk.green(`${result.cost} USDC`));
    if (result.attribution) printField('Attribution', result.attribution);

    if (result.data) {
      console.log('');
      console.log(`  ${chalk.bold('Extracted data')}`);
      for (const [k, v] of Object.entries(result.data)) {
        if (v) printField(`  ${k}`, String(v));
      }
    }

    if (result.policy) {
      console.log('');
      console.log(`  ${chalk.dim('Site has tollway.json policy')}`);
      if (result.policy.pricing?.free_requests_per_day) {
        printField('Free requests/day', result.policy.pricing.free_requests_per_day);
      }
      if (result.policy.data_policy?.training_allowed === false) {
        console.log(`  ${chalk.red('✗')} ${chalk.dim('Training not allowed on this content')}`);
      }
    } else {
      console.log('');
      console.log(`  ${chalk.dim('No tollway.json policy found')}`);
    }

    if (opts.text) {
      console.log('');
      console.log(chalk.dim('  Response body:'));
      console.log(result.text.slice(0, 2000));
      if (result.text.length > 2000) {
        console.log(chalk.dim(`  ... (${result.text.length - 2000} more chars)`));
      }
    }

    console.log('');
  });

// ─── Run ──────────────────────────────────────────────────────────────────────

program.parseAsync(process.argv).catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(chalk.red(`\n  Error: ${msg}\n`));
  process.exit(1);
});

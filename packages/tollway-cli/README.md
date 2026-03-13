# @tollway/cli

Command-line interface for the [Tollway protocol](https://tollway.dev). Generate agent identities, fetch URLs with signed identity headers, and inspect site policies — all from the terminal.

Part of the Tollway open protocol — robots.txt rebuilt for the agentic era.

## Install

```bash
npm install -g @tollway/cli
# or use without installing:
npx @tollway/cli <command>
```

## Quick Start

```bash
# 1. Generate an agent identity
tollway init

# 2. Check a site's policy
tollway policy https://example.com

# 3. Fetch a URL as an identified agent
tollway fetch https://example.com/article
```

## Commands

### `tollway init`

Generate a new Ed25519 key pair and save a `did:key` identity to `~/.tollway/config.json`.

```bash
tollway init                         # generate new identity
tollway init --wallet 0xYourAddress  # associate a USDC wallet
tollway init --force                 # overwrite existing identity
```

### `tollway id`

Show the current saved identity.

```bash
tollway id
tollway id --reputation   # also fetch reputation score from oracle
```

### `tollway policy <url>`

Fetch and display a site's `tollway.json` policy.

```bash
tollway policy https://example.com
tollway policy https://example.com --json   # raw JSON output
```

### `tollway fetch <url>`

Fetch a URL with Tollway identity headers attached.

```bash
tollway fetch https://example.com/article
tollway fetch https://example.com/article --scope summarize
tollway fetch https://example.com/article --purpose "Research for report"
tollway fetch https://example.com/article --json     # full result as JSON
tollway fetch https://example.com/article --text     # include response body
tollway fetch https://example.com/article --headers  # show headers sent
```

## Identity File

Identities are stored at `~/.tollway/config.json` (mode 600, owner-readable only):

```json
{
  "did": "did:key:z6Mk...",
  "privateKey": "<ed25519 private key hex>",
  "wallet": "0x..."
}
```

## Protocol

`@tollway/cli` uses `@tollway/client` internally and implements the [Tollway v0.1 specification](https://github.com/TollwayProtocol/Tollway/blob/main/SPEC.md).

- **Spec:** CC BY 4.0
- **Code:** MIT
- **GitHub:** [TollwayProtocol/Tollway](https://github.com/TollwayProtocol/Tollway)

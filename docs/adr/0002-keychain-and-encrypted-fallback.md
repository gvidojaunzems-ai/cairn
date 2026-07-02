# ADR 0002 — Keychain adapter and AES-256-GCM encrypted-file fallback

- **Status**: Accepted
- **Date**: 2026-07-02
- **Deciders**: Cairn embedded data-layer task
- **Consulted**: `.aide-spec/spec-package.json`,
  `.claude/rules/general/security-practices.md`, [ADR 0001](./0001-stack.md)

## Context

Cairn is a local-first desktop app. Secrets — API keys, OAuth tokens,
Anthropic keys, GitHub PATs, feed credentials — must be readable at
runtime but never persisted in plaintext next to the app data.
Environment variables and configuration files are explicitly off-limits
per the security posture in ADR 0001 (they leak into shell history,
process listings, and screen-shares).

The stub in the foundation task returned `not implemented`. The embedded
data-layer task must land the real adapter.

Constraints from the spec:

- Primary storage: the OS keychain — **Windows Credential Manager**,
  **macOS Keychain**, **Linux Secret Service**.
- Fallback storage: an encrypted file, because Linux Secret Service is
  not always present in CI containers and on headless machines.
- The fallback file must use **AES-256-GCM** and live on disk with
  restrictive permissions.
- The `getSecret(name): Promise<Result<string>>` signature is public and
  must remain backwards-compatible; `setSecret` and `deleteSecret` are
  additive.
- A sentinel secret value must never appear in `cairn.db`, in any log
  file, or in `local.config.json` — only in the keychain (S6).

## Decision

### Primary backend — `@napi-rs/keyring`

We use [`@napi-rs/keyring`](https://github.com/napi-rs/keyring) as the
production keychain adapter. It ships prebuilt N-API binaries for
Windows, macOS, and Linux (no native rebuild step) and hits the platform
keychains directly:

- Windows → Credential Manager
- macOS → Keychain
- Linux → Secret Service (`libsecret`)

The adapter is loaded lazily via `createRequire(import.meta.url)` inside
[`src/shared/keychain.ts`](../../src/shared/keychain.ts) so importing the
module never crashes when the binding is absent (headless CI, unusual
platforms). Absence flips the adapter into fallback mode transparently.

### Fallback backend — AES-256-GCM encrypted file

When `@napi-rs/keyring` is unavailable (or throws), the adapter falls
back to a file at `resolvePaths().data/secrets.enc`, written with mode
`0600`.

The record shape is:

```json
{
  "wrappedKey": "<base64 fallback key, only present when the OS keychain is unavailable>",
  "secrets": {
    "<name>": { "iv": "<base64 12-byte IV>", "tag": "<base64 16-byte auth tag>", "ct": "<base64 ciphertext>" }
  }
}
```

- **Cipher**: `aes-256-gcm` via `node:crypto`. IV is 12 bytes; auth tag
  is 16 bytes; both are stored alongside the ciphertext.
- **Key derivation**: a 32-byte random key generated with
  `crypto.randomBytes(32)`.
- **Key storage** (defence-in-depth): the wrapping key is written to the
  OS keychain under a fixed account name
  (`__cairn_fallback_wrap_key__`). Only when the OS keychain is
  unavailable does the key persist inside the fallback file itself — the
  last-resort branch — with a security caveat surfaced in the adapter.
- **Permissions**: on POSIX we `chmodSync(path, 0o600)` after every
  write (Windows silently ignores).

### Deletion semantics

`deleteSecret(name)` deletes from **both** backends (keychain + fallback
file) so a stale copy can never leak, even if a machine flips between
having a Secret Service backend or not between boots. Deleting a missing
secret is not an error (idempotent).

## Rationale

- **`@napi-rs/keyring` over `keytar`**: `keytar` is archived upstream
  and requires a native rebuild against Electron ABI. `@napi-rs/keyring`
  ships prebuilt Node-API binaries so `pnpm install` doesn't need
  `libsecret-1-dev` on Linux for the common Secret-Service-present case.
- **AES-256-GCM over AES-CBC**: GCM is authenticated (auth tag catches
  tampering); a CBC file would require a separate HMAC.
- **Node built-in `crypto`**: avoids a dependency on an external crypto
  library. All primitives (IV, auth tag, key generation) are well-worn.
- **Key wrapped via keychain when possible**: the fallback file's
  ciphertext is meaningless on its own when the OS keychain holds the
  wrapping key — copying `secrets.enc` off the machine yields nothing.
- **Never write plaintext elsewhere**: neither the SQLite store nor the
  log files nor `local.config.json` are allowed to carry a secret. The
  local-config loader drops any key that matches the secret blocklist
  (`token`, `secret`, `password`, `apiKey`, `credential`,
  `authorization`), and the logger has redaction rules on top.

## Rejected alternatives

- **`keytar`** — archived, supply-chain risk, requires
  `electron-rebuild` step. See ADR 0001.
- **`node-libsecret`** — Linux-only, does not solve Windows/macOS.
- **Plaintext fallback file** — violates S6 (a sentinel secret would
  land on disk).
- **Storing secrets in `local.config.json`** — off-limits by policy;
  files are shared in bug reports and screen-shares.
- **Storing secrets in environment variables** — off-limits by policy;
  leaks into shell history and `ps` listings.
- **AES-256-CBC + HMAC** — twice the code for a weaker primitive. GCM
  gives authenticated encryption for free.
- **Argon2 / PBKDF2 password-derived key** — no password to derive
  from; the desktop app is single-user and has no login step.

## Consequences

- **Linux without Secret Service** (some minimal containers, some
  headless setups) transparently uses the encrypted-file fallback with
  the wrapping key inside the file. This is the weakest configuration
  and is called out at runtime.
- **CI can test without a real keychain**: the fallback path is
  exercised by unit tests (`tests/shared/keychain.test.ts`) and by the
  sentinel-scan test that greps `cairn.db`, the logs, and
  `local.config.json` for a value it just stored via `setSecret`.
- **Backwards compatibility**: the historical `getSecret(name)` +
  `Result<T>` signature is preserved. `setSecret` and `deleteSecret`
  are additive; existing call sites that only import `getSecret` keep
  compiling. `Result<T>` is re-exported from
  [`src/shared/result.ts`](../../src/shared/result.ts) so future modules
  can share the same shape.

## Follow-ups

- Surface a runtime warning banner when the fallback file's wrapping
  key is inside the file (i.e. neither OS keychain nor prior wrap-key
  entry was available).
- Consider hardware-backed keys on macOS (`kSecAttrAccessibleWhenUnlocked`)
  once the app has settled its threat model.

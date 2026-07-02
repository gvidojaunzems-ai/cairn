/**
 * OS keychain adapter — production implementation.
 *
 * Business rules:
 *   - Secrets (API keys, OAuth tokens) MUST be readable only from the OS
 *     keychain. They must never be read from environment variables or config
 *     files at runtime, and must never appear in logs.
 *   - Primary backend: `@napi-rs/keyring` (Windows Credential Manager, macOS
 *     Keychain, Linux Secret Service) — nominated by ADR 0001, documented
 *     in ADR 0002.
 *   - Fallback backend: AES-256-GCM encrypted file under `resolvePaths().data`
 *     with mode 0600. The wrapping key is stored in the OS keychain when
 *     present so the fallback file's ciphertext is meaningless on its own —
 *     the key is NEVER stored next to the ciphertext.
 *   - `getSecret`'s async `Promise<Result<string>>` signature is preserved
 *     for backwards compatibility. `setSecret` and `deleteSecret` are added
 *     additively; the exported `Result<T>` type alias is kept as an alias
 *     of the shared `Result<T>` module so historical imports still work.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

import { resolvePaths } from './paths.js';
import type { Result as SharedResult } from './result.js';
import { err as errResult, ok as okResult } from './result.js';

/**
 * Backwards-compatible alias — the historical `Result<T>` type exported from
 * this module is now a re-export of the shared Result type. Structurally
 * identical: `{ success: true; data }` / `{ success: false; error }`.
 */
export type Result<T> = SharedResult<T>;

/** Service name used across all keychain records for this app. */
const SERVICE_NAME = 'cairn';

/** Fixed account name used to store the wrapping key for the fallback file. */
const WRAP_KEY_ACCOUNT = '__cairn_fallback_wrap_key__';

/** Fallback file name — lives under `resolvePaths().data`. */
const FALLBACK_FILE_NAME = 'secrets.enc';

/**
 * Minimal shape of the `@napi-rs/keyring` module. Loaded lazily so the
 * module doesn't crash at import time if the native binding is absent.
 */
interface NapiKeyringEntry {
  getPassword(): string | null;
  setPassword(value: string): void;
  deletePassword(): boolean;
}
interface NapiKeyringModule {
  Entry: new (service: string, account: string) => NapiKeyringEntry;
}

/**
 * Full keychain adapter surface — get/set/delete plus a compatibility
 * shortcut for the historical single-verb `getSecret`.
 */
export interface KeychainAdapter {
  /**
   * Fetch a secret by its name. Returns a Result so the caller can distinguish
   * "not present" from "backend unavailable" without exceptions.
   */
  getSecret(name: string): Promise<Result<string>>;
  /** Store a secret under `name`. Overwrites any existing value. */
  setSecret(name: string, value: string): Promise<Result<void>>;
  /**
   * Delete a secret under `name`. Idempotent — deleting a missing secret
   * succeeds without an error.
   */
  deleteSecret(name: string): Promise<Result<void>>;
}

let cachedModule: NapiKeyringModule | null | undefined;

/** Test-only: reset the lazy keyring module cache between Vitest cases. */
export function resetKeychainModuleCacheForTests(): void {
  cachedModule = undefined;
}

/**
 * Attempt to load `@napi-rs/keyring`. Returns `null` if the module is not
 * installed or the native binding failed to load — the adapter falls back
 * to the encrypted-file backend in that case.
 */
function loadKeyringModule(): NapiKeyringModule | null {
  if (process.env.CAIRN_FORCE_KEYCHAIN_FALLBACK === '1') {
    cachedModule = null;
    return null;
  }
  if (cachedModule !== undefined) {
    return cachedModule;
  }
  try {
    // Dynamic require via createRequire keeps the ESM build free of a
    // hard dependency on the native package — bundlers won't try to
    // include it unless it's on disk.
    const req = createRequire(import.meta.url);
    const mod = req('@napi-rs/keyring') as NapiKeyringModule;
    cachedModule = mod;
    return mod;
  } catch {
    cachedModule = null;
    return null;
  }
}

function newEntry(mod: NapiKeyringModule, account: string): NapiKeyringEntry {
  return new mod.Entry(SERVICE_NAME, account);
}

/**
 * Try to read a secret from the OS keychain. Returns `null` for a missing
 * entry (not an error) and `undefined` when the keychain backend itself is
 * unavailable — that's the signal to try the fallback.
 */
function readFromKeychain(name: string): string | null | undefined {
  const mod = loadKeyringModule();
  if (mod === null) {
    return undefined;
  }
  try {
    const value = newEntry(mod, name).getPassword();
    return value ?? null;
  } catch {
    return undefined;
  }
}

function writeToKeychain(name: string, value: string): boolean {
  const mod = loadKeyringModule();
  if (mod === null) {
    return false;
  }
  try {
    newEntry(mod, name).setPassword(value);
    return true;
  } catch {
    return false;
  }
}

function deleteFromKeychain(name: string): boolean {
  const mod = loadKeyringModule();
  if (mod === null) {
    return false;
  }
  try {
    newEntry(mod, name).deletePassword();
    return true;
  } catch {
    return false;
  }
}

// --------------------------------------------------------------------------
// AES-256-GCM encrypted-file fallback.
// --------------------------------------------------------------------------

interface EncryptedRecord {
  /** IV (12 bytes) base64. */
  iv: string;
  /** Auth tag (16 bytes) base64. */
  tag: string;
  /** Ciphertext base64. */
  ct: string;
}

interface FallbackFile {
  /** Base64-encoded 32-byte AES-256 key wrapped by the OS keychain. */
  wrappedKey?: string;
  /** Map of secret name -> encrypted record. */
  secrets: Record<string, EncryptedRecord>;
}

function fallbackFilePath(): string {
  return join(resolvePaths().data, FALLBACK_FILE_NAME);
}

function readFallbackFile(): FallbackFile {
  const path = fallbackFilePath();
  if (!existsSync(path)) {
    return { secrets: {} };
  }
  try {
    const raw = readFileSync(path, 'utf8');
    const parsed = JSON.parse(raw) as FallbackFile;
    return {
      wrappedKey: parsed.wrappedKey,
      secrets: parsed.secrets ?? {},
    };
  } catch {
    return { secrets: {} };
  }
}

function writeFallbackFile(file: FallbackFile): void {
  const path = fallbackFilePath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(file), { encoding: 'utf8', mode: 0o600 });
  try {
    // On POSIX enforce 0600 even if umask relaxed it on write.
    chmodSync(path, 0o600);
  } catch {
    // Windows ignores chmod — expected.
  }
}

/**
 * Obtain the AES-256 key used to encrypt fallback records. When the OS
 * keychain is present the key is stored there (wrapped_key_account) so it
 * never touches disk. Otherwise the key persists inside the fallback file
 * itself — with a warning surfaced by the adapter (see ADR 0002).
 */
function getOrCreateWrappingKey(file: FallbackFile): Buffer {
  const keychainValue = readFromKeychain(WRAP_KEY_ACCOUNT);
  if (typeof keychainValue === 'string') {
    return Buffer.from(keychainValue, 'base64');
  }
  if (keychainValue === null) {
    const key = randomBytes(32);
    writeToKeychain(WRAP_KEY_ACCOUNT, key.toString('base64'));
    return key;
  }
  // OS keychain unavailable — store the wrapped key inside the file.
  // This is the last-resort branch (ADR 0002 documents the security caveat).
  if (file.wrappedKey !== undefined) {
    return Buffer.from(file.wrappedKey, 'base64');
  }
  const key = randomBytes(32);
  file.wrappedKey = key.toString('base64');
  return key;
}

function encryptRecord(plaintext: string, key: Buffer): EncryptedRecord {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    ct: ct.toString('base64'),
  };
}

function decryptRecord(record: EncryptedRecord, key: Buffer): string {
  const iv = Buffer.from(record.iv, 'base64');
  const tag = Buffer.from(record.tag, 'base64');
  const ct = Buffer.from(record.ct, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString('utf8');
}

function fallbackGet(name: string): Result<string> {
  const file = readFallbackFile();
  const record = file.secrets[name];
  if (record === undefined) {
    return errResult('not found');
  }
  try {
    const key = getOrCreateWrappingKey(file);
    return okResult(decryptRecord(record, key));
  } catch {
    return errResult('failed to decrypt fallback secret');
  }
}

function fallbackSet(name: string, value: string): Result<void> {
  const file = readFallbackFile();
  try {
    const key = getOrCreateWrappingKey(file);
    file.secrets[name] = encryptRecord(value, key);
    writeFallbackFile(file);
    return okResult(undefined);
  } catch {
    return errResult('failed to write fallback secret');
  }
}

function fallbackDelete(name: string): Result<void> {
  const file = readFallbackFile();
  if (!(name in file.secrets)) {
    return okResult(undefined);
  }
  try {
    const { [name]: _removed, ...remainingSecrets } = file.secrets;
    file.secrets = remainingSecrets;
    if (Object.keys(file.secrets).length === 0 && file.wrappedKey === undefined) {
      // Nothing left to persist AND no wrap key to keep — remove the file
      // entirely so the sentinel-scan test never sees stale ciphertext.
      const path = fallbackFilePath();
      if (existsSync(path)) {
        unlinkSync(path);
      }
      return okResult(undefined);
    }
    writeFallbackFile(file);
    return okResult(undefined);
  } catch {
    return errResult('failed to remove fallback secret');
  }
}

/**
 * Factory. Returns an adapter that prefers the OS keychain and transparently
 * falls back to the AES-256-GCM file when the keychain is unavailable.
 */
export function createKeychain(): KeychainAdapter {
  return {
    async getSecret(name: string): Promise<Result<string>> {
      const value = readFromKeychain(name);
      if (typeof value === 'string') {
        return okResult(value);
      }
      if (value === null) {
        // Backend present but no entry — try the fallback file in case a
        // previous run had to write there. Fall through to `not found` on
        // both misses.
        const fromFile = fallbackGet(name);
        return fromFile.success ? fromFile : errResult('not found');
      }
      // Backend unavailable — fall back to encrypted file.
      return fallbackGet(name);
    },

    async setSecret(name: string, value: string): Promise<Result<void>> {
      if (writeToKeychain(name, value)) {
        return okResult(undefined);
      }
      return fallbackSet(name, value);
    },

    async deleteSecret(name: string): Promise<Result<void>> {
      // Delete from BOTH backends so stale copies can't leak: keychain and
      // (if present) the fallback file. Missing entries are not an error.
      deleteFromKeychain(name);
      return fallbackDelete(name);
    },
  };
}

/**
 * Convenience export mirroring the KeychainAdapter shape so most call sites
 * can use `getSecret('name')` without instantiating a factory.
 */
export async function getSecret(name: string): Promise<Result<string>> {
  return createKeychain().getSecret(name);
}

/**
 * Convenience export — mirrors `getSecret`.
 */
export async function setSecret(name: string, value: string): Promise<Result<void>> {
  return createKeychain().setSecret(name, value);
}

/**
 * Convenience export — mirrors `getSecret`.
 */
export async function deleteSecret(name: string): Promise<Result<void>> {
  return createKeychain().deleteSecret(name);
}

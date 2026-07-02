/**
 * OS keychain adapter — STUB.
 *
 * Business rules:
 *   - Secrets (API keys, OAuth tokens) MUST be readable only from the OS
 *     keychain. They must never be read from environment variables or config
 *     files at runtime, and must never appear in logs.
 *   - This file is a stub returning a Result-shaped failure. See ADR 0001 for
 *     the intended concrete adapter (`@napi-rs/keyring`) — prebuilt N-API
 *     binaries, no @electron/rebuild step required, and cross-OS reach
 *     (Windows Credential Manager, macOS Keychain, Linux Secret Service).
 */

/**
 * Result-shape return value — see `.claude/rules/examples/golden-examples.md`.
 * Keeping the type local avoids a runtime dependency on a shared Result
 * module before that module exists.
 */
export type Result<T> =
  | { success: true; data: T }
  | { success: false; error: string };

export interface KeychainAdapter {
  /**
   * Fetch a secret by its name. Returns a Result so the caller can distinguish
   * "not present" from "backend unavailable" without exceptions.
   */
  getSecret(name: string): Promise<Result<string>>;
}

/**
 * Stub factory. Real implementation lands in a follow-up task backed by
 * `@napi-rs/keyring` — see docs/adr/0001-stack.md.
 */
export function createKeychain(): KeychainAdapter {
  return {
    async getSecret(_name: string): Promise<Result<string>> {
      // Business rule: never surface a "success with empty string" result —
      // that would let callers accidentally treat missing secrets as valid.
      return { success: false, error: 'not implemented' };
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

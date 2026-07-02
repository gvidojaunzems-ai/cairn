/**
 * macOS notarisation hook — STUB.
 *
 * Invoked by electron-builder via the `afterSign` config in electron-builder.yml.
 *
 * Business rules:
 *   - Code signing and notarisation are deferred to a hardening task. This
 *     file exists only so electron-builder's `afterSign` reference resolves.
 *   - Real implementation should read APPLE_ID and APPLE_APP_SPECIFIC_PASSWORD
 *     from the environment (never from a config file, never logged) and call
 *     `@electron/notarize`.
 *   - Bail early on non-macOS platforms so packaging Windows/Linux from a
 *     dev machine doesn't try to notarise.
 */

// TODO (hardening task): call @electron/notarize with Apple credentials from
// the environment. Until then, this hook is a deliberate no-op so packaging
// works on unsigned dev builds.
module.exports = async function notarize(_context) {
  if (process.platform !== 'darwin') {
    return;
  }
  // Deferred — see docs/adr/0001-stack.md for the notarisation roadmap.
};

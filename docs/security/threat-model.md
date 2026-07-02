# Threat model (Spec 20)

## Privacy invariants

1. No code in WIP signals — enforced by `validateSignalPrivacy()` in team-repo engine
2. Meeting audio stays on-device — STT buffer discarded after transcription
3. Secrets in OS keychain only — never DB, config, team repo, or logs
4. Claude calls explicit and metered — budget ledger + `budget.updated`
5. Team repo holds no secrets

## Tests

`tests/security/privacy-invariants.test.ts`

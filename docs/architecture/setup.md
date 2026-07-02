# First-run setup (Spec 08)

Eight bootstrap steps orchestrated by `src/main/engines/setup-orchestrator.ts`.

**Ops:** `setup.getState`, `setup.run` (returns jobId), `setup.cancel`

**Events:** `setup.progress { step, pct, label }`

UI: Setup screen wizard in renderer.

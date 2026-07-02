# Team repo schema (Spec 04)

Canonical on-disk layout under `team-repo/`:

```
cairn-team/
  cairn.config.yaml
  projects/<slug>.md
  updates/<YYYY-MM-DD>/<handle>.md
  signals/<YYYY-MM-DD>/<handle>.json
  decisions/<NNNN>-<slug>.md
  apps/<slug>.md
  apps/tickets/<id>.md
  docs/<group>/<slug>.md
  meetings/<YYYY-MM-DD>-<slug>.md
  news/<YYYY-MM-DD>-digest.md
  pulse/<YYYY>-W<WW>.md
```

All writes go through `src/main/engines/team-repo-engine.ts`. WIP signals are metadata-only (no code/diffs).

Parsers: `parseProjectFile`, `parseSignalFile`, `parseUpdateFile`, etc.

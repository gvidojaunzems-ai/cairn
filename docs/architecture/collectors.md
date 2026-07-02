# Collectors & scheduler (Spec 06)

Background collectors (cadence via `src/main/collectors/scheduler.ts`):

| Collector | Emits |
|-----------|-------|
| team-sync | `sync.updated` |
| wip-signals | `signals.updated` |
| news | `news.updated` |

Started from main-process bootstrap after DB open.

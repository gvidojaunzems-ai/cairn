/**
 * Team repo engine — git sync, artifact I/O, local repo scanner, DB reconcile.
 *
 * Sole gateway for all team-repo mutations. WIP signal JSON must NEVER
 * contain code or diffs (privacy invariant).
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';

import type Database from 'better-sqlite3';

import { resolvePaths, teamRepoDir } from '../../shared/paths.js';
import type { LocalReposDao } from '../db/dao/local-repos.js';
import type { ProjectsDao } from '../db/dao/projects.js';
import type { WipSignalsDao } from '../db/dao/wip-signals.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SyncStatus = 'synced' | 'pending' | 'offline' | 'error' | 'conflict';

export interface SyncStateView {
  status: SyncStatus;
  lastSyncedAt: string | null;
  pendingChanges: number;
  message: string;
}

export interface LocalRepoEntry {
  id: string;
  name: string;
  path: string;
  branch: string;
  ahead: number;
  dirty: boolean;
}

export interface WipSignalArtifact {
  schema_version: number;
  person: string;
  ts: string;
  project?: string;
  branch: string;
  ahead_local: number;
  ahead_pushed: number;
  files_touched: string[];
  last_active: string;
  unpushed_days: number;
  summary: string;
}

export interface ProjectArtifact {
  schema_version: number;
  id: string;
  name: string;
  status: 'active' | 'idle' | 'stalled' | 'shipped' | 'archived' | 'drift';
  owner?: string;
  repo_url?: string;
  created_at: string;
  deadline?: string;
  goal?: string;
  success_criteria?: string[];
  non_goals?: string[];
  body?: string;
}

export interface UpdateArtifact {
  schema_version: number;
  date: string;
  person: string;
  approved_at?: string;
  body: string;
}

export interface ReconcileCallbacks {
  onProjects?(items: ProjectArtifact[]): void;
  onSignals?(items: WipSignalArtifact[]): void;
  onSyncUpdated?(entityTypes: string[]): void;
}

export interface TeamRepoEngineOptions {
  db: Database.Database;
  localReposDao?: LocalReposDao;
  projectsDao?: ProjectsDao;
  wipSignalsDao?: WipSignalsDao;
  reconcile?: ReconcileCallbacks;
}

export interface TeamRepoEngine {
  getSyncState(): SyncStateView;
  pull(): SyncStateView;
  push(message?: string): SyncStateView;
  writeUpdate(artifact: UpdateArtifact, handle: string): string;
  writeSignal(artifact: WipSignalArtifact, handle: string): string;
  upsertProject(artifact: ProjectArtifact): string;
  writeDecision(id: string, title: string, body: string, meta?: Record<string, unknown>): string;
  writeDoc(group: string, slug: string, title: string, body: string, meta?: Record<string, unknown>): string;
  writeMeeting(date: string, slug: string, title: string, body: string, meta?: Record<string, unknown>): string;
  writeTicket(appSlug: string, ticketId: string, title: string, body: string, meta?: Record<string, unknown>): string;
  upsertApp(slug: string, name: string, body: string, meta?: Record<string, unknown>): string;
  writePulse(week: string, body: string): string;
  listLocalRepos(): LocalRepoEntry[];
  addLocalRepo(path: string, name?: string): LocalRepoEntry;
  scanLocalRepo(repoId: string): LocalRepoEntry | null;
  reconcileFromDisk(): void;
}

const SCHEMA_VERSION = 1;
const FORBIDDEN_SIGNAL_PATTERNS = [
  /^diff --git/m,
  /^@@ /m,
  /^\+{3} /m,
  /^-{3} /m,
  /function\s+\w+\s*\(/,
  /class\s+\w+/,
  /import\s+.*from/,
];

// ---------------------------------------------------------------------------
// Frontmatter helpers
// ---------------------------------------------------------------------------

function parseFrontmatter(raw: string): { meta: Record<string, unknown>; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/u.exec(raw);
  if (match === null) {
    return { meta: {}, body: raw };
  }
  const meta: Record<string, unknown> = {};
  for (const line of match[1].split('\n')) {
    const kv = /^([^:]+):\s*(.*)$/.exec(line.trim());
    if (kv === null) continue;
    const key = kv[1].trim();
    const rawVal = kv[2].trim();
    let val: unknown = rawVal;
    if (rawVal.startsWith('[') && rawVal.endsWith(']')) {
      try {
        val = JSON.parse(rawVal.replace(/'/g, '"')) as unknown;
      } catch {
        val = rawVal.slice(1, -1).split(',').map((s: string) => s.trim());
      }
    }
    meta[key] = val;
  }
  return { meta, body: match[2] };
}

function serializeFrontmatter(meta: Record<string, unknown>, body: string): string {
  const lines = ['---'];
  for (const [key, value] of Object.entries(meta)) {
    if (Array.isArray(value)) {
      lines.push(`${key}: ${JSON.stringify(value)}`);
    } else {
      lines.push(`${key}: ${String(value)}`);
    }
  }
  lines.push('---', '', body.trim(), '');
  return lines.join('\n');
}

function nowIso(): string {
  return new Date().toISOString();
}

function todayDate(): string {
  return nowIso().slice(0, 10);
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// ---------------------------------------------------------------------------
// Git ops
// ---------------------------------------------------------------------------

function gitAvailable(): boolean {
  try {
    const r = spawnSync('git', ['--version'], { encoding: 'utf8' });
    return r.status === 0;
  } catch {
    return false;
  }
}

function runGit(cwd: string, args: string[]): { ok: boolean; stdout: string; stderr: string } {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  return { ok: r.status === 0, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

function ensureRepoLayout(root: string): void {
  const dirs = [
    'projects',
    'updates',
    'signals',
    'decisions',
    'apps/tickets',
    'docs',
    'meetings',
    'news',
    'pulse',
  ];
  for (const d of dirs) {
    mkdirSync(join(root, d), { recursive: true });
  }
  const configPath = join(root, 'cairn.config.yaml');
  if (!existsSync(configPath)) {
    writeFileSync(
      configPath,
      serializeFrontmatter({ schema_version: SCHEMA_VERSION, team: 'cairn' }, '# Team config\n'),
      'utf8',
    );
  }
}

function initRepoIfNeeded(root: string): void {
  ensureRepoLayout(root);
  if (!existsSync(join(root, '.git'))) {
    if (gitAvailable()) {
      runGit(root, ['init']);
      runGit(root, ['add', '.']);
      runGit(root, ['commit', '-m', 'cairn: bootstrap team repo']);
    }
  }
}

function countPendingChanges(root: string): number {
  if (!gitAvailable() || !existsSync(join(root, '.git'))) {
    return 0;
  }
  const status = runGit(root, ['status', '--porcelain']);
  return status.stdout.split('\n').filter((l) => l.trim().length > 0).length;
}

function commitAll(root: string, message: string): void {
  if (!gitAvailable()) return;
  runGit(root, ['add', '-A']);
  if (countPendingChanges(root) > 0 || runGit(root, ['diff', '--cached', '--quiet']).ok === false) {
    runGit(root, ['commit', '-m', message]);
  }
}

// ---------------------------------------------------------------------------
// Privacy validation
// ---------------------------------------------------------------------------

export function validateSignalPrivacy(signal: WipSignalArtifact): void {
  const summaryPatterns = [
    /^diff --git/m,
    /^@@ /m,
    /^\+\+\+ /m,
    /^--- /m,
    /function\s+\w+\s*\(/,
    /class\s+\w+/,
    /import\s+.*from/,
  ];
  for (const pattern of summaryPatterns) {
    if (pattern.test(signal.summary)) {
      throw new Error('WIP signal must not contain code or diff content');
    }
  }
  if (signal.summary.length > 500) {
    throw new Error('WIP signal summary too long');
  }
}

// ---------------------------------------------------------------------------
// Parsers / writers
// ---------------------------------------------------------------------------

export function parseProjectFile(raw: string): ProjectArtifact {
  const { meta, body } = parseFrontmatter(raw);
  return {
    schema_version: Number(meta.schema_version ?? SCHEMA_VERSION),
    id: String(meta.id ?? ''),
    name: String(meta.name ?? ''),
    status: (meta.status as ProjectArtifact['status']) ?? 'active',
    owner: meta.owner !== undefined ? String(meta.owner) : undefined,
    repo_url: meta.repo_url !== undefined ? String(meta.repo_url) : undefined,
    created_at: String(meta.created_at ?? nowIso()),
    deadline: meta.deadline !== undefined ? String(meta.deadline) : undefined,
    goal: meta.goal !== undefined ? String(meta.goal) : undefined,
    success_criteria: Array.isArray(meta.success_criteria)
      ? (meta.success_criteria as string[])
      : undefined,
    non_goals: Array.isArray(meta.non_goals) ? (meta.non_goals as string[]) : undefined,
    body,
  };
}

export function writeProjectFile(artifact: ProjectArtifact): string {
  const { body, ...meta } = artifact;
  return serializeFrontmatter(
    {
      schema_version: artifact.schema_version,
      id: artifact.id,
      name: artifact.name,
      status: artifact.status,
      owner: artifact.owner,
      repo_url: artifact.repo_url,
      created_at: artifact.created_at,
      deadline: artifact.deadline,
      goal: artifact.goal,
      success_criteria: artifact.success_criteria,
      non_goals: artifact.non_goals,
    },
    body ?? '',
  );
}

export function parseSignalFile(raw: string): WipSignalArtifact {
  return JSON.parse(raw) as WipSignalArtifact;
}

export function writeSignalFile(artifact: WipSignalArtifact): string {
  validateSignalPrivacy(artifact);
  return `${JSON.stringify({ ...artifact, schema_version: SCHEMA_VERSION }, null, 2)}\n`;
}

export function parseUpdateFile(raw: string): UpdateArtifact {
  const { meta, body } = parseFrontmatter(raw);
  return {
    schema_version: Number(meta.schema_version ?? SCHEMA_VERSION),
    date: String(meta.date ?? todayDate()),
    person: String(meta.person ?? ''),
    approved_at: meta.approved_at !== undefined ? String(meta.approved_at) : undefined,
    body,
  };
}

export function writeUpdateFile(artifact: UpdateArtifact): string {
  return serializeFrontmatter(
    {
      schema_version: artifact.schema_version,
      date: artifact.date,
      person: artifact.person,
      approved_at: artifact.approved_at,
    },
    artifact.body,
  );
}

export function readSyncState(db: Database.Database): SyncStateView {
  const row = db
    .prepare(`SELECT last_synced_at, cursor FROM sync_state WHERE entity_type = 'team-repo' LIMIT 1`)
    .get() as { last_synced_at: string | null; cursor: string | null } | undefined;

  const root = teamRepoDir(resolvePaths());
  const pending = countPendingChanges(root);
  const lastSyncedAt = row?.last_synced_at ?? null;
  const conflicted = row?.cursor === 'conflict';

  if (conflicted) {
    return {
      status: 'conflict',
      lastSyncedAt,
      pendingChanges: pending,
      message: 'Team repo has unresolved conflicts',
    };
  }
  if (lastSyncedAt === null) {
    return {
      status: pending > 0 ? 'pending' : 'offline',
      lastSyncedAt,
      pendingChanges: pending,
      message: 'Team repo not linked — working from local cache',
    };
  }
  return {
    status: pending > 0 ? 'pending' : 'synced',
    lastSyncedAt,
    pendingChanges: pending,
    message: pending > 0 ? `${String(pending)} local change(s) not pushed` : `Last synced ${lastSyncedAt}`,
  };
}

function persistSyncState(db: Database.Database, cursor: string | null = null): void {
  const ts = nowIso();
  db.prepare(
    `INSERT INTO sync_state (id, entity_type, last_synced_at, cursor, created_at, updated_at)
     VALUES ('team-repo', 'team-repo', @ts, @cursor, @ts, @ts)
     ON CONFLICT(id) DO UPDATE SET last_synced_at = @ts, cursor = @cursor, updated_at = @ts`,
  ).run({ ts, cursor });
}

// ---------------------------------------------------------------------------
// Local repo scanner
// ---------------------------------------------------------------------------

function scanGitRepo(path: string): Omit<LocalRepoEntry, 'id' | 'name'> {
  if (!existsSync(path)) {
    return { path, branch: 'unknown', ahead: 0, dirty: false };
  }
  if (!gitAvailable() || !existsSync(join(path, '.git'))) {
    return { path, branch: 'local', ahead: 0, dirty: false };
  }
  const branch = runGit(path, ['rev-parse', '--abbrev-ref', 'HEAD']).stdout.trim() || 'unknown';
  const status = runGit(path, ['status', '--porcelain']);
  const dirty = status.stdout.trim().length > 0;
  let ahead = 0;
  const aheadOut = runGit(path, ['rev-list', '--count', '@{u}..HEAD']);
  if (aheadOut.ok) {
    ahead = Number.parseInt(aheadOut.stdout.trim(), 10) || 0;
  }
  return { path, branch, ahead, dirty };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createTeamRepoEngine(options: TeamRepoEngineOptions): TeamRepoEngine {
  const { db } = options;
  const root = teamRepoDir(resolvePaths());
  initRepoIfNeeded(root);

  function writeFile(relPath: string, content: string): string {
    const full = join(root, relPath);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content, 'utf8');
    return relPath;
  }

  function reconcileFromDisk(): void {
    const entityTypes: string[] = [];
    const projects: ProjectArtifact[] = [];
    const signals: WipSignalArtifact[] = [];

    const projectsDir = join(root, 'projects');
    if (existsSync(projectsDir)) {
      for (const file of readdirSync(projectsDir)) {
        if (!file.endsWith('.md')) continue;
        const raw = readFileSync(join(projectsDir, file), 'utf8');
        projects.push(parseProjectFile(raw));
      }
      entityTypes.push('projects');
    }

    const signalsRoot = join(root, 'signals');
    if (existsSync(signalsRoot)) {
      for (const day of readdirSync(signalsRoot)) {
        const dayDir = join(signalsRoot, day);
        if (!statSync(dayDir).isDirectory()) continue;
        for (const file of readdirSync(dayDir)) {
          if (!file.endsWith('.json')) continue;
          const raw = readFileSync(join(dayDir, file), 'utf8');
          signals.push(parseSignalFile(raw));
        }
      }
      entityTypes.push('signals');
    }

    if (options.projectsDao !== undefined) {
      for (const p of projects) {
        options.projectsDao.upsert({
          id: p.id || slugify(p.name),
          name: p.name,
          description: p.goal ?? p.body?.slice(0, 200) ?? null,
          status: p.status === 'shipped' ? 'completed' : p.status === 'archived' ? 'archived' : 'active',
          createdAt: p.created_at,
          updatedAt: nowIso(),
        });
      }
    }

    if (options.wipSignalsDao !== undefined) {
      for (const s of signals) {
        options.wipSignalsDao.upsert({
          id: `signal-${s.person}-${s.ts.slice(0, 10)}`,
          entityId: s.person,
          entityType: 'person',
          summary: s.summary,
          status: 'active',
          source: s.branch,
          createdAt: s.ts,
          updatedAt: s.ts,
        });
      }
    }

    options.reconcile?.onProjects?.(projects);
    options.reconcile?.onSignals?.(signals);
    if (entityTypes.length > 0) {
      options.reconcile?.onSyncUpdated?.(entityTypes);
    }
  }

  return {
    getSyncState: () => readSyncState(db),

    pull: () => {
      if (gitAvailable() && existsSync(join(root, '.git'))) {
        const result = runGit(root, ['pull', '--ff-only']);
        if (!result.ok && result.stderr.includes('CONFLICT')) {
          db.prepare(
            `INSERT INTO sync_state (id, entity_type, last_synced_at, cursor, created_at, updated_at)
             VALUES ('team-repo', 'team-repo', @ts, 'conflict', @ts, @ts)
             ON CONFLICT(id) DO UPDATE SET cursor = 'conflict', updated_at = @ts`,
          ).run({ ts: nowIso() });
          return readSyncState(db);
        }
      }
      reconcileFromDisk();
      persistSyncState(db);
      return readSyncState(db);
    },

    push: (message = 'cairn: sync') => {
      commitAll(root, message);
      if (gitAvailable() && existsSync(join(root, '.git'))) {
        runGit(root, ['push']);
      }
      persistSyncState(db);
      return readSyncState(db);
    },

    writeUpdate: (artifact, handle) => {
      const date = artifact.date || todayDate();
      const rel = `updates/${date}/${handle}.md`;
      writeFile(rel, writeUpdateFile({ ...artifact, date }));
      return rel;
    },

    writeSignal: (artifact, handle) => {
      validateSignalPrivacy(artifact);
      const date = artifact.ts.slice(0, 10);
      const rel = `signals/${date}/${handle}.json`;
      writeFile(rel, writeSignalFile(artifact));
      return rel;
    },

    upsertProject: (artifact) => {
      const slug = slugify(artifact.name || artifact.id);
      const rel = `projects/${slug}.md`;
      writeFile(rel, writeProjectFile({ ...artifact, schema_version: SCHEMA_VERSION }));
      return rel;
    },

    writeDecision: (id, title, body, meta = {}) => {
      const slug = slugify(title);
      const rel = `decisions/${id}-${slug}.md`;
      writeFile(
        rel,
        serializeFrontmatter(
          { schema_version: SCHEMA_VERSION, id, title, status: 'proposed', date: todayDate(), ...meta },
          body,
        ),
      );
      return rel;
    },

    writeDoc: (group, slug, title, body, meta = {}) => {
      const rel = `docs/${group}/${slug}.md`;
      writeFile(
        rel,
        serializeFrontmatter(
          {
            schema_version: SCHEMA_VERSION,
            title,
            group,
            source: 'manual',
            status: 'ok',
            updated_at: nowIso(),
            ...meta,
          },
          body,
        ),
      );
      return rel;
    },

    writeMeeting: (date, slug, title, body, meta = {}) => {
      const rel = `meetings/${date}-${slug}.md`;
      writeFile(
        rel,
        serializeFrontmatter(
          { schema_version: SCHEMA_VERSION, date, title, attendees: [], ...meta },
          body,
        ),
      );
      return rel;
    },

    writeTicket: (appSlug, ticketId, title, body, meta = {}) => {
      const rel = `apps/tickets/${ticketId}.md`;
      writeFile(
        rel,
        serializeFrontmatter(
          {
            schema_version: SCHEMA_VERSION,
            id: ticketId,
            app: appSlug,
            title,
            priority: 'medium',
            status: 'open',
            opened_at: nowIso(),
            ...meta,
          },
          body,
        ),
      );
      return rel;
    },

    upsertApp: (slug, name, body, meta = {}) => {
      const rel = `apps/${slug}.md`;
      writeFile(
        rel,
        serializeFrontmatter(
          { schema_version: SCHEMA_VERSION, id: slug, name, owner: '', health: 'ok', ...meta },
          body,
        ),
      );
      return rel;
    },

    writePulse: (week, body) => {
      const rel = `pulse/${week}.md`;
      writeFile(
        rel,
        serializeFrontmatter({ week, generated_at: nowIso() }, body),
      );
      return rel;
    },

    listLocalRepos: () => {
      if (options.localReposDao !== undefined) {
        return options.localReposDao.list().map((r) => ({
          id: r.id,
          name: r.name,
          path: r.path,
          branch: r.branch ?? 'unknown',
          ahead: r.ahead,
          dirty: r.dirty,
        }));
      }
      return [];
    },

    addLocalRepo: (path, name) => {
      const scanned = scanGitRepo(path);
      const id = `repo-${createHash('sha256').update(path).digest('hex').slice(0, 8)}`;
      const entry: LocalRepoEntry = {
        id,
        name: name ?? basename(path),
        path,
        branch: scanned.branch,
        ahead: scanned.ahead,
        dirty: scanned.dirty,
      };
      if (options.localReposDao !== undefined) {
        options.localReposDao.upsert({
          id,
          name: entry.name,
          path,
          branch: entry.branch,
          ahead: entry.ahead,
          dirty: entry.dirty,
          lastScannedAt: nowIso(),
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });
      }
      return entry;
    },

    scanLocalRepo: (repoId) => {
      const repos = options.localReposDao?.list() ?? [];
      const repo = repos.find((r) => r.id === repoId);
      if (repo === undefined) return null;
      const scanned = scanGitRepo(repo.path);
      const updated: LocalRepoEntry = {
        id: repo.id,
        name: repo.name,
        path: repo.path,
        branch: scanned.branch,
        ahead: scanned.ahead,
        dirty: scanned.dirty,
      };
      options.localReposDao?.upsert({
        ...repo,
        branch: scanned.branch,
        ahead: scanned.ahead,
        dirty: scanned.dirty,
        lastScannedAt: nowIso(),
        updatedAt: nowIso(),
      });
      return updated;
    },

    reconcileFromDisk,
  };
}

/** Legacy exports for git-sync.ts compatibility */
export function markSynced(db: Database.Database): SyncStateView {
  const ts = nowIso();
  db.prepare(
    `INSERT INTO sync_state (id, entity_type, last_synced_at, cursor, created_at, updated_at)
     VALUES ('team-repo', 'team-repo', @ts, NULL, @ts, @ts)
     ON CONFLICT(id) DO UPDATE SET last_synced_at = @ts, updated_at = @ts`,
  ).run({ ts });
  return readSyncState(db);
}

export function listLocalRepos(): LocalRepoEntry[] {
  return createTeamRepoEngine({ db: {} as Database.Database }).listLocalRepos();
}

export const getSyncState = readSyncState;

/**
 * One-shot local dev environment setup for Cairn.
 *
 *   - Verifies Node, git, Ollama, and native modules
 *   - Creates app-data directories and local.config.json
 *   - Initializes the team git repo with fixture project artifacts
 *   - Seeds cairn.db, registers the dev checkout as a local repo
 *   - Probes Ollama for llama3.2 + nomic-embed-text
 *
 * Run: `pnpm setup:env`
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createSettingsKvDao } from '../src/main/db/dao/settings-kv.js';
import { PROJECT_FIXTURES } from '../src/main/db/fixtures/projects.js';
import { seedPersistedDatabase } from '../src/main/db/fixtures/fixture-dao.js';
import { openStore } from '../src/main/db/store.js';
import {
  createTeamRepoEngine,
  writeProjectFile,
  type ProjectArtifact,
} from '../src/main/engines/team-repo-engine.js';
import { localConfigPath } from '../src/main/config/local-config.js';
import {
  createDirectories,
  databaseFile,
  resolvePaths,
  teamRepoDir,
} from '../src/shared/paths.js';
import { verifyNativeModules } from './verify-native-modules.js';

const OLLAMA_BASE = process.env.CAIRN_OLLAMA_URL ?? 'http://127.0.0.1:11434';
const REQUIRED_MODELS = ['llama3.2', 'nomic-embed-text'] as const;

export interface SetupReport {
  ok: boolean;
  nodeVersion: string;
  gitAvailable: boolean;
  nativeModules: ReturnType<typeof verifyNativeModules>;
  ollama: { reachable: boolean; models: string[]; missing: string[] };
  paths: ReturnType<typeof resolvePaths>;
  database: string;
  teamRepo: string;
  localConfig: string;
  seededRows: number;
  peopleCount: number;
  localRepoRegistered: boolean;
  warnings: string[];
}

function gitAvailable(): boolean {
  try {
    return spawnSync('git', ['--version'], { encoding: 'utf8' }).status === 0;
  } catch {
    return false;
  }
}

function mapProjectStatus(status: string): ProjectArtifact['status'] {
  switch (status) {
    case 'discovery':
    case 'planning':
      return 'idle';
    case 'blocked':
      return 'stalled';
    case 'shipped':
      return 'shipped';
    case 'archived':
      return 'archived';
    case 'drift':
      return 'drift';
    default:
      return 'active';
  }
}

function seedTeamRepoProjects(root: string): number {
  let written = 0;
  for (const project of PROJECT_FIXTURES) {
    const rel = join('projects', `${project.slug}.md`);
    const full = join(root, rel);
    if (existsSync(full)) {
      continue;
    }
    mkdirSync(dirname(full), { recursive: true });
    const artifact: ProjectArtifact = {
      schema_version: 1,
      id: project.id,
      name: project.name,
      status: mapProjectStatus(project.status),
      created_at: project.createdAt,
      goal: project.summary,
      body: `# ${project.name}\n\n${project.summary ?? ''}\n`,
    };
    writeFileSync(full, writeProjectFile(artifact), 'utf8');
    written += 1;
  }
  return written;
}

async function probeOllama(): Promise<SetupReport['ollama']> {
  try {
    const response = await fetch(`${OLLAMA_BASE}/api/tags`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      return { reachable: false, models: [], missing: [...REQUIRED_MODELS] };
    }
    const body = (await response.json()) as { models?: { name: string }[] };
    const models = (body.models ?? []).map((m) => m.name.replace(/:latest$/, ''));
    const missing = REQUIRED_MODELS.filter(
      (required) => !models.some((name) => name === required || name.startsWith(`${required}:`)),
    );
    return { reachable: true, models, missing };
  } catch {
    return { reachable: false, models: [], missing: [...REQUIRED_MODELS] };
  }
}

export async function setupEnvironment(projectRoot?: string): Promise<SetupReport> {
  const warnings: string[] = [];
  const root = projectRoot ?? resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const paths = resolvePaths();
  createDirectories(paths);

  const nativeModules = verifyNativeModules();
  const ollama = await probeOllama();

  if (!gitAvailable()) {
    warnings.push('git is not available on PATH — team-repo git features will be limited');
  }

  if (!ollama.reachable) {
    warnings.push(
      `Ollama is not reachable at ${OLLAMA_BASE} — install Ollama and run: ollama pull llama3.2 && ollama pull nomic-embed-text`,
    );
  } else if (ollama.missing.length > 0) {
    warnings.push(`Missing Ollama models: ${ollama.missing.join(', ')} — run: ollama pull <model>`);
  }

  const configPath = localConfigPath();
  if (!existsSync(configPath)) {
    writeFileSync(
      configPath,
      `${JSON.stringify({ defaultRepoPath: root, locale: 'en' }, null, 2)}\n`,
      'utf8',
    );
  }

  const teamRoot = teamRepoDir(paths);
  seedTeamRepoProjects(teamRoot);

  const store = openStore();
  const peopleBefore = store.db.prepare('SELECT COUNT(*) AS c FROM people').get() as { c: number };
  let seededRows = 0;
  if (peopleBefore.c === 0) {
    seededRows = seedPersistedDatabase(store.db);
  }

  const settings = createSettingsKvDao(store.db);
  settings.set('setupComplete', true);

  const teamRepoEngine = createTeamRepoEngine({
    db: store.db,
    localReposDao: store.localReposDao,
    projectsDao: store.projectsDao,
    wipSignalsDao: store.wipSignalsDao,
  });

  const existingRepos = teamRepoEngine.listLocalRepos();
  let localRepoRegistered = existingRepos.some((repo) => resolve(repo.path) === resolve(root));
  if (!localRepoRegistered) {
    teamRepoEngine.addLocalRepo(root, 'Cairn (dev)');
    localRepoRegistered = true;
  }

  teamRepoEngine.pull();
  teamRepoEngine.reconcileFromDisk();

  const peopleCount = (store.db.prepare('SELECT COUNT(*) AS c FROM people').get() as { c: number }).c;
  store.close();

  const report: SetupReport = {
    ok: warnings.length === 0,
    nodeVersion: process.version,
    gitAvailable: gitAvailable(),
    nativeModules,
    ollama,
    paths,
    database: databaseFile(paths),
    teamRepo: teamRoot,
    localConfig: configPath,
    seededRows,
    peopleCount,
    localRepoRegistered,
    warnings,
  };

  return report;
}

async function main(): Promise<void> {
  const major = Number.parseInt(process.versions.node.split('.')[0] ?? '0', 10);
  if (major < 20) {
    process.stderr.write(
      `Node ${process.version} detected — Cairn requires Node >= 20. Run: fnm use 20\n`,
    );
    process.exitCode = 1;
    return;
  }

  const report = await setupEnvironment();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

  if (report.warnings.length > 0) {
    process.stderr.write('\nSetup completed with warnings:\n');
    for (const warning of report.warnings) {
      process.stderr.write(`  - ${warning}\n`);
    }
  }

  if (!report.nativeModules.betterSqlite3Loaded) {
    process.exitCode = 1;
  }
}

const invokedDirectly =
  typeof process.argv[1] === 'string' &&
  (process.argv[1].endsWith('setup-environment.ts') ||
    process.argv[1].endsWith('setup-environment.js'));

if (invokedDirectly) {
  void main();
}

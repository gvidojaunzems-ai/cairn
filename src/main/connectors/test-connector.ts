/**
 * Connector health checks for settings.testConnector.
 */
import { spawnSync } from 'node:child_process';

import { getSecret } from '../../shared/keychain.js';

const OLLAMA_BASE = process.env.CAIRN_OLLAMA_URL ?? 'http://127.0.0.1:11434';
const DEFAULT_RSS = 'https://hnrss.org/frontpage';

export interface ConnectorTestResult {
  ok: boolean;
  message: string;
}

async function testGit(): Promise<ConnectorTestResult> {
  try {
    const result = spawnSync('git', ['--version'], { encoding: 'utf8' });
    if (result.status === 0) {
      return { ok: true, message: result.stdout.trim() };
    }
    return { ok: false, message: 'git not available on PATH' };
  } catch {
    return { ok: false, message: 'git not available on PATH' };
  }
}

async function testOllama(): Promise<ConnectorTestResult> {
  try {
    const response = await fetch(`${OLLAMA_BASE}/api/tags`, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) {
      return { ok: false, message: `Ollama HTTP ${response.status}` };
    }
    const body = (await response.json()) as { models?: { name: string }[] };
    const count = body.models?.length ?? 0;
    return { ok: true, message: `Ollama reachable (${count} model(s))` };
  } catch {
    return { ok: false, message: `Cannot reach Ollama at ${OLLAMA_BASE}` };
  }
}

async function testGithub(): Promise<ConnectorTestResult> {
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json' };
  const tokenResult = await getSecret('github.pat');
  const token = tokenResult.success ? tokenResult.data : undefined;
  if (token !== undefined && token.length > 0) {
    headers.Authorization = `Bearer ${token}`;
  }
  try {
    const response = await fetch('https://api.github.com/rate_limit', {
      headers,
      signal: AbortSignal.timeout(8000),
    });
    if (response.status === 401) {
      return { ok: false, message: 'GitHub token invalid or expired' };
    }
    if (!response.ok) {
      return { ok: false, message: `GitHub API HTTP ${response.status}` };
    }
    const body = (await response.json()) as { rate?: { remaining?: number } };
    const remaining = body.rate?.remaining ?? '?';
    return {
      ok: true,
      message: token !== undefined ? `GitHub authenticated (${remaining} req/hr left)` : `GitHub public API OK (${remaining} req/hr)`,
    };
  } catch {
    return { ok: false, message: 'GitHub API unreachable (check network)' };
  }
}

async function testRss(): Promise<ConnectorTestResult> {
  try {
    const response = await fetch(DEFAULT_RSS, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) {
      return { ok: false, message: `RSS feed HTTP ${response.status}` };
    }
    const text = await response.text();
    if (!text.includes('<rss') && !text.includes('<feed')) {
      return { ok: false, message: 'Response is not a valid RSS/Atom feed' };
    }
    return { ok: true, message: 'RSS feed fetch OK' };
  } catch {
    return { ok: false, message: 'RSS feed unreachable (offline?)' };
  }
}

async function testSlack(): Promise<ConnectorTestResult> {
  const tokenResult = await getSecret('slack.token');
  if (!tokenResult.success || tokenResult.data.length === 0) {
    return { ok: false, message: 'Slack token not configured in keychain (slack.token)' };
  }
  const token = tokenResult.data;
  try {
    const response = await fetch('https://slack.com/api/auth.test', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      signal: AbortSignal.timeout(8000),
    });
    const body = (await response.json()) as { ok?: boolean; error?: string; team?: string };
    if (body.ok === true) {
      return { ok: true, message: `Slack connected (${body.team ?? 'workspace'})` };
    }
    return { ok: false, message: body.error ?? 'Slack auth failed' };
  } catch {
    return { ok: false, message: 'Slack API unreachable' };
  }
}

export async function testConnector(connector: string): Promise<ConnectorTestResult> {
  switch (connector.toLowerCase()) {
    case 'git':
      return testGit();
    case 'ollama':
    case 'ai':
      return testOllama();
    case 'github':
      return testGithub();
    case 'rss':
    case 'news':
      return testRss();
    case 'slack':
      return testSlack();
    default:
      return { ok: false, message: `Unknown connector: ${connector}` };
  }
}

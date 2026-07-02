/**
 * Runtime dependency probes — git, Ollama, whisper.cpp sidecar.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { resolveWhisperBinary } from '../engines/whisper-sidecar.js';

export interface RuntimeDepStatus {
  available: boolean;
  message: string;
  detail?: string;
}

export interface RuntimeDeps {
  git: RuntimeDepStatus;
  ollama: RuntimeDepStatus;
  whisper: RuntimeDepStatus;
}

const OLLAMA_BASE = process.env.CAIRN_OLLAMA_URL ?? 'http://127.0.0.1:11434';

function probeGit(): RuntimeDepStatus {
  try {
    const result = spawnSync('git', ['--version'], { encoding: 'utf8' });
    if (result.status === 0) {
      return { available: true, message: 'Git available', detail: result.stdout.trim() };
    }
    return { available: false, message: 'Git not found on PATH' };
  } catch {
    return { available: false, message: 'Git not found on PATH' };
  }
}

async function probeOllama(): Promise<RuntimeDepStatus> {
  try {
    const response = await fetch(`${OLLAMA_BASE}/api/tags`, { signal: AbortSignal.timeout(4000) });
    if (!response.ok) {
      return { available: false, message: `Ollama unreachable (${response.status})` };
    }
    const body = (await response.json()) as { models?: { name: string }[] };
    const names = (body.models ?? []).map((m) => m.name);
    const hasChat = names.some((n) => n.startsWith('llama3.2'));
    const hasEmbed = names.some((n) => n.startsWith('nomic-embed-text'));
    if (!hasChat || !hasEmbed) {
      return {
        available: false,
        message: 'Ollama running but required models missing',
        detail: `Have: ${names.join(', ') || 'none'}. Run: ollama pull llama3.2 && ollama pull nomic-embed-text`,
      };
    }
    return { available: true, message: 'Ollama ready', detail: names.join(', ') };
  } catch {
    return {
      available: false,
      message: 'Ollama not reachable',
      detail: `Install from https://ollama.com and ensure ${OLLAMA_BASE} is listening`,
    };
  }
}

function probeWhisper(): RuntimeDepStatus {
  const binary = resolveWhisperBinary();
  if (binary === null) {
    return {
      available: false,
      message: 'whisper.cpp binary not bundled',
      detail: 'Meeting STT uses simulation until a sidecar is installed under resources/whisper/',
    };
  }
  if (!existsSync(binary)) {
    return { available: false, message: 'whisper.cpp path configured but missing', detail: binary };
  }
  return { available: true, message: 'whisper.cpp sidecar found', detail: binary };
}

let cachedDeps: { at: number; deps: RuntimeDeps } | null = null;
const CACHE_MS = 30_000;

export function resetRuntimeDepsCacheForTests(): void {
  cachedDeps = null;
}

export async function probeRuntimeDeps(force = false): Promise<RuntimeDeps> {
  if (!force && cachedDeps !== null && Date.now() - cachedDeps.at < CACHE_MS) {
    return cachedDeps.deps;
  }
  const [ollama] = await Promise.all([probeOllama()]);
  const deps: RuntimeDeps = {
    git: probeGit(),
    ollama,
    whisper: probeWhisper(),
  };
  cachedDeps = { at: Date.now(), deps };
  return deps;
}

/** Convenience path for bundled whisper resources (documented in ADR). */
export function whisperResourceDir(): string {
  return join(process.cwd(), 'resources', 'whisper');
}

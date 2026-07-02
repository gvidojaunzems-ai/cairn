/**
 * Redacted diagnostics bundle export (Spec 21).
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { loadLocalConfig } from '../config/local-config.js';
import { probeRuntimeDeps } from '../runtime/deps-probe.js';
import { resolvePaths } from '../../shared/paths.js';
import { loadFlags } from '../../shared/feature-flags.js';

const SECRET_PATTERN = /(?:token|secret|password|api[_-]?key|authorization|bearer)\s*[:=]\s*\S+/gi;

function redact(text: string): string {
  return text.replace(SECRET_PATTERN, '[REDACTED]');
}

function tailFile(path: string, maxBytes = 32_768): string | null {
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, 'utf8');
    return redact(raw.length > maxBytes ? raw.slice(-maxBytes) : raw);
  } catch {
    return null;
  }
}

export interface DiagnosticsExport {
  path: string;
  exportedAt: string;
}

export async function exportDiagnosticsBundle(): Promise<DiagnosticsExport> {
  const paths = resolvePaths();
  const exportedAt = new Date().toISOString();
  const runtime = await probeRuntimeDeps();
  const logsDir = paths.logs;
  const logTail: Record<string, string> = {};
  if (existsSync(logsDir)) {
    for (const file of readdirSync(logsDir).slice(-5)) {
      const content = tailFile(join(logsDir, file));
      if (content !== null) {
        logTail[file] = content;
      }
    }
  }

  const bundle = {
    exportedAt,
    appVersion: process.env.npm_package_version ?? '0.0.0',
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    paths: { data: paths.data, logs: paths.logs, cache: paths.cache },
    runtime,
    flags: loadFlags(),
    localConfig: loadLocalConfig(),
    logTail,
  };

  const outDir = join(paths.data, 'diagnostics');
  mkdirSync(outDir, { recursive: true });
  const hash = createHash('sha256').update(exportedAt).digest('hex').slice(0, 8);
  const fileName = `cairn-diagnostics-${exportedAt.replace(/[:.]/g, '-')}-${hash}.json`;
  const outPath = join(outDir, fileName);
  writeFileSync(outPath, `${JSON.stringify(bundle, null, 2)}\n`, 'utf8');
  return { path: outPath, exportedAt };
}

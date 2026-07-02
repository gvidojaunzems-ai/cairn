/**
 * AI engine — local-first LLM routing, embeddings, budget ledger, caching.
 *
 * Replaces ai-router.ts. All model access goes through this module.
 */
import { createHash } from 'node:crypto';

import type Database from 'better-sqlite3';

import type { CoreServiceResult } from '../../contracts/core-service.contract.js';
import { getSecret } from '../../shared/keychain.js';
import type { SettingsKvDao } from '../db/dao/settings-kv.js';
import { VECTOR_DIMENSION } from '../db/schema.js';
import { okResult } from '../ipc/errors.js';

export interface AiCompleteInput {
  prompt?: string;
  taskType?: string;
  qualityTier?: 'fast' | 'polished';
  external?: boolean;
  maxTokens?: number;
  inputs?: unknown;
}

export interface AiCompleteOutput {
  text: string;
  model: string;
  source: 'local' | 'claude' | 'template';
  tokensIn: number;
  tokensOut: number;
  estCost: number;
  cached: boolean;
  truncated: boolean;
}

export interface AiBudgetView {
  used: number;
  cap: number;
  weekStart: string;
}

export interface AiModelInfo {
  id: string;
  name: string;
  source: 'local' | 'claude';
  available: boolean;
}

export interface BudgetUpdatedCallback {
  (budget: AiBudgetView): void;
}

export interface AiEngineOptions {
  db: Database.Database;
  settings: SettingsKvDao;
  ollamaBaseUrl?: string;
  onBudgetUpdated?: BudgetUpdatedCallback;
}

export interface AiEngine {
  complete(input: AiCompleteInput): Promise<CoreServiceResult<AiCompleteOutput>>;
  estimate(input: AiCompleteInput): CoreServiceResult<{ tokensIn: number; estCost: number }>;
  listModels(): Promise<CoreServiceResult<{ models: AiModelInfo[] }>>;
  getBudget(): CoreServiceResult<AiBudgetView>;
  embed(text: string): CoreServiceResult<{ embedding: Float32Array; dimensions: number }>;
}

interface TaskTypeDef {
  templateId: string;
  promptVersion: number;
  defaultTier: 'fast' | 'polished';
  defaultModel: string;
  structured: boolean;
}

const TASK_REGISTRY: Record<string, TaskTypeDef> = {
  'standup.draft': { templateId: 'standup', promptVersion: 1, defaultTier: 'fast', defaultModel: 'llama3.2', structured: false },
  'charter.infer': { templateId: 'charter', promptVersion: 1, defaultTier: 'fast', defaultModel: 'llama3.2', structured: false },
  'drift.check': { templateId: 'drift', promptVersion: 1, defaultTier: 'fast', defaultModel: 'llama3.2', structured: false },
  'poc.summary': { templateId: 'poc', promptVersion: 1, defaultTier: 'fast', defaultModel: 'llama3.2', structured: false },
  'poc.retro': { templateId: 'retro', promptVersion: 1, defaultTier: 'fast', defaultModel: 'llama3.2', structured: false },
  'news.summary': { templateId: 'news', promptVersion: 1, defaultTier: 'fast', defaultModel: 'llama3.2', structured: false },
  'news.why': { templateId: 'news-why', promptVersion: 1, defaultTier: 'fast', defaultModel: 'llama3.2', structured: false },
  'meeting.extract': { templateId: 'meeting', promptVersion: 1, defaultTier: 'fast', defaultModel: 'llama3.2', structured: true },
  'diff.summary': { templateId: 'diff', promptVersion: 1, defaultTier: 'fast', defaultModel: 'llama3.2', structured: false },
  'dailies.pack': { templateId: 'dailies', promptVersion: 1, defaultTier: 'fast', defaultModel: 'llama3.2', structured: false },
  'doc.qa': { templateId: 'doc-qa', promptVersion: 1, defaultTier: 'fast', defaultModel: 'llama3.2', structured: false },
  'doc.draft': { templateId: 'doc-draft', promptVersion: 1, defaultTier: 'fast', defaultModel: 'llama3.2', structured: false },
  'merge.assist': { templateId: 'merge', promptVersion: 1, defaultTier: 'polished', defaultModel: 'claude-3-5-sonnet', structured: false },
  'report.weekly': { templateId: 'report', promptVersion: 1, defaultTier: 'polished', defaultModel: 'claude-3-5-sonnet', structured: false },
  chat: { templateId: 'chat', promptVersion: 1, defaultTier: 'fast', defaultModel: 'llama3.2', structured: false },
};

const DEFAULT_WEEKLY_CAP = 100_000;
const CLAUDE_COST_PER_1K = 0.003;
const DEFAULT_CHAT_MODEL = 'llama3.2';
const DEFAULT_EMBED_MODEL = 'nomic-embed-text';
const CACHE_PREFIX = 'ai.cache.';

function normalizePrompt(input: AiCompleteInput): string {
  return input.prompt ?? JSON.stringify(input.inputs ?? '');
}

function nowIso(): string {
  return new Date().toISOString();
}

function weekStartIso(): string {
  const d = new Date();
  const day = d.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setUTCDate(d.getUTCDate() - diff);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function hashInputs(taskType: string, prompt: string, version: number, model: string): string {
  return createHash('sha256')
    .update(`${taskType}|v${String(version)}|${model}|${prompt}`)
    .digest('hex')
    .slice(0, 32);
}

function templateResponse(taskType: string | undefined, prompt: string): string {
  switch (taskType) {
    case 'standup.draft':
      return [
        '## Yesterday',
        '- Shipped sqlite-vec integration and IPC job manager wiring.',
        '- Reviewed PRs for the vector search PoC.',
        '',
        '## Today',
        '- Finish Today dashboard widgets and standup approve flow.',
        '- Pair on WIP radar signal collectors.',
        '',
        '## Blockers',
        '- None — Ollama offline falls back to template drafts.',
      ].join('\n');
    case 'poc.summary':
      return 'Active PoC focused on local vector retrieval. Recent commits align with the charter goal of top-k search over squad knowledge.';
    case 'charter.infer':
      return [
        '## Goal',
        'Validate the described PoC scope against existing squad assets.',
        '',
        '## Success criteria',
        '- Demo-ready retrieval over seeded fixtures',
        '- Sub-100ms IPC round-trip for status checks',
        '',
        '## Non-goals',
        '- Hosted backend or cloud sync',
      ].join('\n');
    case 'drift.check':
      return 'On-goal (78%): recent activity matches charter themes. Minor drift: config refactor touches adjacent modules.';
    case 'news.summary':
      return 'Local AI news digest: vector databases, local LLM runtimes, and squad tooling updates worth a skim.';
    case 'meeting.extract':
      return JSON.stringify({
        summary: 'Squad sync on PoC progress and blockers.',
        decisions: ['Continue with local-first vector index'],
        actionItems: [{ owner: 'team', text: 'Review charter drift check results' }],
      });
    case 'diff.summary':
      return 'Refactored IPC handlers and added engine layer without changing public contracts.';
    case 'dailies.pack':
      return 'Daily pack: 2 active PoCs, 3 open action items, 1 unpushed WIP signal.';
    case 'doc.qa':
      return `Based on the indexed docs: ${prompt.slice(0, 120)}… (template answer — start Ollama for live RAG).`;
    default:
      return `Local template response for: ${prompt.slice(0, 200)}`;
  }
}

function deterministicEmbed(text: string): Float32Array {
  const out = new Float32Array(VECTOR_DIMENSION);
  for (let i = 0; i < VECTOR_DIMENSION; i += 1) {
    const ch = text.charCodeAt(i % Math.max(text.length, 1));
    out[i] = Math.sin(ch + i * 0.01) * 0.5;
  }
  return out;
}

function readBudgetUsed(db: Database.Database): number {
  const weekStart = weekStartIso();
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM budget_ledger WHERE ledger_date >= ?`,
    )
    .get(weekStart) as { total: number };
  return row.total;
}

function recordBudgetSpend(db: Database.Database, tokens: number, description: string): void {
  const ts = nowIso();
  const id = `budget-${Date.now().toString(36)}`;
  db.prepare(
    `INSERT INTO budget_ledger (id, project_id, amount, currency, description, ledger_date, created_at, updated_at)
     VALUES (@id, NULL, @amount, 'tokens', @description, @ledgerDate, @ts, @ts)`,
  ).run({ id, amount: tokens, description, ledgerDate: ts.slice(0, 10), ts });
}

async function tryOllamaGenerate(
  baseUrl: string,
  prompt: string,
  model: string,
): Promise<string | undefined> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(`${baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt, stream: false }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!response.ok) return undefined;
    const body = (await response.json()) as { response?: string };
    return typeof body.response === 'string' ? body.response : undefined;
  } catch {
    return undefined;
  }
}

async function tryOllamaEmbed(
  baseUrl: string,
  text: string,
  model: string,
): Promise<Float32Array | undefined> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(`${baseUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt: text }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!response.ok) return undefined;
    const body = (await response.json()) as { embedding?: number[] };
    if (!Array.isArray(body.embedding) || body.embedding.length === 0) return undefined;
    const arr = new Float32Array(body.embedding.length);
    for (let i = 0; i < body.embedding.length; i += 1) {
      arr[i] = body.embedding[i] ?? 0;
    }
    if (arr.length !== VECTOR_DIMENSION) {
      const resized = new Float32Array(VECTOR_DIMENSION);
      for (let i = 0; i < VECTOR_DIMENSION; i += 1) {
        resized[i] = arr[i % arr.length] ?? 0;
      }
      return resized;
    }
    return arr;
  } catch {
    return undefined;
  }
}

async function tryClaude(apiKey: string, prompt: string, maxTokens: number): Promise<string | undefined> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!response.ok) return undefined;
    const body = (await response.json()) as { content?: { type: string; text?: string }[] };
    return body.content?.find((c) => c.type === 'text')?.text;
  } catch {
    return undefined;
  }
}

export function createAiEngine(options: AiEngineOptions): AiEngine {
  const { db, settings } = options;
  const ollamaBase = options.ollamaBaseUrl ?? 'http://127.0.0.1:11434';

  function getCap(): number {
    const stored = settings.get('ai.budgetCap');
    return typeof stored === 'number' ? stored : DEFAULT_WEEKLY_CAP;
  }

  function emitBudget(): void {
    options.onBudgetUpdated?.({
      used: readBudgetUsed(db),
      cap: getCap(),
      weekStart: weekStartIso(),
    });
  }

  function readCache(key: string): AiCompleteOutput | undefined {
    const raw = settings.get(`${CACHE_PREFIX}${key}`);
    if (raw === undefined || typeof raw !== 'object' || raw === null) return undefined;
    return raw as AiCompleteOutput;
  }

  function writeCache(key: string, output: AiCompleteOutput): void {
    settings.set(`${CACHE_PREFIX}${key}`, output);
  }

  return {
    getBudget: () =>
      okResult({ used: readBudgetUsed(db), cap: getCap(), weekStart: weekStartIso() }),

    estimate: (input) => {
      const tokensIn = estimateTokens(normalizePrompt(input));
      const tier = input.qualityTier ?? 'fast';
      const estCost =
        input.external === true && tier === 'polished' ? (tokensIn / 1000) * CLAUDE_COST_PER_1K * 1000 : 0;
      return okResult({ tokensIn, estCost });
    },

    async complete(input) {
      const taskType = input.taskType ?? 'chat';
      const def = TASK_REGISTRY[taskType] ?? TASK_REGISTRY.chat;
      const prompt = normalizePrompt(input);
      const cacheKey = hashInputs(taskType, prompt, def.promptVersion, def.defaultModel);
      const cached = readCache(cacheKey);
      if (cached !== undefined) return okResult({ ...cached, cached: true });

      const tokensIn = estimateTokens(prompt);
      const maxTokens = input.maxTokens ?? 1024;
      const tier = input.qualityTier ?? def.defaultTier;
      const wantsClaude = input.external === true && tier === 'polished';

      if (wantsClaude) {
        const keyResult = await getSecret('anthropic_api_key');
        if (keyResult.success) {
          const estCost = (tokensIn / 1000) * CLAUDE_COST_PER_1K * 1000;
          if (readBudgetUsed(db) + estCost <= getCap()) {
            const claudeText = await tryClaude(keyResult.data, prompt, maxTokens);
            if (claudeText !== undefined) {
              const tokensOut = estimateTokens(claudeText);
              recordBudgetSpend(db, tokensIn + tokensOut, `claude:${taskType}`);
              emitBudget();
              const output: AiCompleteOutput = {
                text: claudeText,
                model: 'claude-3-5-sonnet',
                source: 'claude',
                tokensIn,
                tokensOut,
                estCost,
                cached: false,
                truncated: false,
              };
              writeCache(cacheKey, output);
              return okResult(output);
            }
          }
        }
      }

      const ollamaText = await tryOllamaGenerate(ollamaBase, prompt, DEFAULT_CHAT_MODEL);
      const text = ollamaText ?? templateResponse(taskType, prompt);
      const output: AiCompleteOutput = {
        text,
        model: ollamaText !== undefined ? DEFAULT_CHAT_MODEL : 'cairn-template',
        source: ollamaText !== undefined ? 'local' : 'template',
        tokensIn,
        tokensOut: estimateTokens(text),
        estCost: 0,
        cached: false,
        truncated: text.length >= maxTokens,
      };
      writeCache(cacheKey, output);
      return okResult(output);
    },

    async listModels() {
      const models: AiModelInfo[] = [
        { id: DEFAULT_CHAT_MODEL, name: DEFAULT_CHAT_MODEL, source: 'local', available: true },
        { id: DEFAULT_EMBED_MODEL, name: DEFAULT_EMBED_MODEL, source: 'local', available: true },
      ];
      try {
        const response = await fetch(`${ollamaBase}/api/tags`, { signal: AbortSignal.timeout(3000) });
        if (response.ok) {
          const body = (await response.json()) as { models?: { name: string }[] };
          for (const m of body.models ?? []) {
            if (!models.some((x) => x.id === m.name)) {
              models.push({ id: m.name, name: m.name, source: 'local', available: true });
            }
          }
        }
      } catch {
        // offline
      }
      const keyResult = await getSecret('anthropic_api_key');
      models.push({
        id: 'claude-3-5-sonnet',
        name: 'Claude 3.5 Sonnet',
        source: 'claude',
        available: keyResult.success,
      });
      return okResult({ models });
    },

    embed(text) {
      return okResult({ embedding: deterministicEmbed(text), dimensions: VECTOR_DIMENSION });
    },
  };
}

export async function aiEmbedAsync(
  engine: AiEngine,
  text: string,
  ollamaBaseUrl = 'http://127.0.0.1:11434',
): Promise<Float32Array> {
  const fromOllama = await tryOllamaEmbed(ollamaBaseUrl, text, DEFAULT_EMBED_MODEL);
  if (fromOllama !== undefined) return fromOllama;
  const result = engine.embed(text);
  return result.ok ? result.data.embedding : deterministicEmbed(text);
}

export async function aiComplete(
  input: AiCompleteInput,
  db?: Database.Database,
  settings?: SettingsKvDao,
): Promise<CoreServiceResult<AiCompleteOutput>> {
  const engine = createAiEngine({
    db: db ?? ({} as Database.Database),
    settings: settings ?? { get: () => undefined, set: () => {}, delete: () => false, list: () => ({}) },
  });
  return engine.complete(input);
}

export function aiEmbed(text: string): CoreServiceResult<{ embedding: number[]; dimensions: number }> {
  const embedding = deterministicEmbed(text);
  return okResult({ embedding: Array.from(embedding), dimensions: VECTOR_DIMENSION });
}

export { TASK_REGISTRY };

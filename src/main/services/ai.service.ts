/**

 * `ai.*` service — local AI completion, embeddings, budget.

 */

import type { CoreServiceResult } from '../../contracts/core-service.contract.js';

import { aiComplete, aiEmbed, type AiCompleteInput, type AiCompleteOutput } from '../engines/ai-engine.js';

import { errResult, makeError } from '../ipc/errors.js';

import type { ServiceContext } from './service-context.js';



export interface AiRpcInput {
  taskType?: string;
  inputs?: unknown;
  prompt?: string;
  qualityTier?: string;
  external?: boolean;
  maxTokens?: number;
}

export interface AiService {
  chat(input: { prompt: string; taskType?: string }): Promise<CoreServiceResult<{ reply: string; source: string; model: string }>>;
  embed(input: { text: string }): CoreServiceResult<{ dimensions: number }>;
  complete(input: AiRpcInput): Promise<CoreServiceResult<AiCompleteOutput>>;
  estimate(input: AiRpcInput): CoreServiceResult<{ tokensIn: number; estCost: number }>;

  listModels(): Promise<CoreServiceResult<{ models: unknown[] }>>;

  getBudget(): CoreServiceResult<{ used: number; cap: number; weekStart: string }>;

}



function notReady(): CoreServiceResult<never> {

  return errResult(makeError('unavailable', 'AI engine not initialized'));

}



function normalizeInput(input: AiRpcInput): AiCompleteInput {
  const prompt =
    input.prompt ??
    (typeof input.inputs === 'string' ? input.inputs : JSON.stringify(input.inputs ?? ''));
  const qualityTier =
    input.qualityTier === 'polished' || input.qualityTier === 'fast' ? input.qualityTier : undefined;
  return { ...input, prompt, taskType: input.taskType ?? 'chat', qualityTier };
}



export function createAiService(ctx?: ServiceContext): AiService {

  return {

    chat: async (input) => {

      const result = ctx

        ? await ctx.aiEngine.complete({ prompt: input.prompt, taskType: input.taskType ?? 'chat' })

        : await aiComplete({ prompt: input.prompt, taskType: input.taskType ?? 'chat' });

      if (!result.ok) return result;

      return {

        ok: true,

        apiVersion: result.apiVersion,

        data: { reply: result.data.text, source: result.data.source, model: result.data.model },

      };

    },

    embed: (input) => {

      const result = ctx ? ctx.aiEngine.embed(input.text) : aiEmbed(input.text);

      if (!result.ok) return result;

      return { ok: true, apiVersion: result.apiVersion, data: { dimensions: result.data.dimensions } };

    },

    complete: (input) => {

      const normalized = normalizeInput(input);

      return ctx ? ctx.aiEngine.complete(normalized) : aiComplete(normalized);

    },

    estimate: (input) => {

      const normalized = normalizeInput(input);

      return ctx ? ctx.aiEngine.estimate(normalized) : notReady();

    },

    listModels: () => (ctx ? ctx.aiEngine.listModels() : Promise.resolve(notReady())),

    getBudget: () => (ctx ? ctx.aiEngine.getBudget() : notReady()),

  };

}



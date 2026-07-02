/**
 * `ai.*` service — Ollama / whisper / embedding stubs.
 */
import type { CoreServiceResult } from '../../contracts/core-service.contract.js';
import { notImplementedResult } from '../ipc/errors.js';

export interface AiService {
  chat(input: { prompt: string }): CoreServiceResult<never>;
  embed(input: { text: string }): CoreServiceResult<never>;
}

export const aiService: AiService = {
  chat: (_input) => notImplementedResult('ai.chat'),
  embed: (_input) => notImplementedResult('ai.embed'),
};

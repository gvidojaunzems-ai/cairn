/**
 * AI router — re-exports from ai-engine for backward compatibility.
 */
export {
  aiComplete,
  aiEmbed,
  createAiEngine,
  aiEmbedAsync,
  TASK_REGISTRY,
  type AiCompleteInput,
  type AiCompleteOutput,
  type AiEngine,
  type AiBudgetView,
} from './ai-engine.js';

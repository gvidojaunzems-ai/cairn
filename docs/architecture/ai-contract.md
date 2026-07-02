# AI task contract (Spec 05)

Invoke via `ai.complete` only.

**Request:** `{ taskType, inputs, qualityTier?, external?, maxTokens?, temperature?, context? }`

**Response:** `{ text, model, source: 'local' | 'claude' | 'template', tokensIn, tokensOut, estCost, cached, truncated }`

**Routing:** local (Ollama) by default; Claude only when `qualityTier='polished'` AND `external=true` AND keychain key present AND budget allows.

**Task types:** `standup.draft`, `charter.infer`, `drift.check`, `poc.summary`, `news.summary`, `meeting.extract`, `doc.qa`, `dailies.pack`, etc.

Implementation: `src/main/engines/ai-engine.ts`

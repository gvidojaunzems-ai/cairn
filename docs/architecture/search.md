# Search & knowledge index (Spec 07)

- **Hybrid query:** keyword scan + sqlite-vec top-k (`search.query`)
- **RAG:** `search.askDocs` retrieves doc chunks and synthesizes an answer locally
- **Rebuild:** job kind `search.rebuildAll`

Implementation: `src/main/engines/search-engine.ts`

/**
 * DomainModel contract.
 *
 * DO NOT MODIFY EXPORTS WITHOUT A VERSIONING ADR.
 *
 * Business rules:
 *   - `KnowledgeItem` is the fundamental unit of the knowledge base — every
 *     later domain concept (article, note, commit-snippet) narrows this
 *     interface additively.
 *   - Keep `content` as `string`. Binary blobs and structured payloads live
 *     elsewhere and reference the item by `id`.
 */

/**
 * A single indexed piece of knowledge (article, note, chunk, etc.).
 */
export interface KnowledgeItem {
  /** Stable identifier assigned at ingest time. */
  id: string;
  /** Item kind — free-form, defined by producers (e.g. 'article', 'note'). */
  type: string;
  /** Textual content. Binary payloads must be referenced, not embedded. */
  content: string;
}

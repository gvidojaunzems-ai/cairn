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
 *   - New entity interfaces below are ADDITIVE. Existing consumers that only
 *     depend on `KnowledgeItem` continue to compile unchanged.
 *   - Status enums are closed unions — adding a new state requires a
 *     versioning ADR (documented in docs/architecture/domain-model.md).
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

// --------------------------------------------------------------------------
// Additive entity types — introduced in migration 0001-init.ts.
// --------------------------------------------------------------------------

/**
 * Squad member identity. Names in fixtures are stable (Gvido, Lars, Maria,
 * Priya, Tom); other people are ingested from git commit authors and news.
 */
export interface Person {
  id: string;
  name: string;
  /** Optional handle for git-commit attribution or news mentions. */
  handle?: string;
  email?: string;
  /** ISO-8601 timestamp; when the person was first seen in Cairn. */
  createdAt: string;
}

/** Lifecycle state for a Project. */
export type ProjectStatus =
  | 'discovery'
  | 'active'
  | 'blocked'
  | 'paused'
  | 'shipped'
  | 'archived';

/**
 * A PoC / squad project. Six named PoC projects ship as fixtures.
 */
export interface Project {
  id: string;
  slug: string;
  name: string;
  status: ProjectStatus;
  /** Short one-line summary shown in list views. */
  summary?: string;
  /** ISO-8601. */
  createdAt: string;
  /** ISO-8601. */
  updatedAt: string;
}

/**
 * A charter document scoped to a Project (e.g. the poc-vector-search charter).
 * The body is Markdown; binary attachments live in `attachments`.
 */
export interface Charter {
  id: string;
  projectId: string;
  title: string;
  /** Markdown body. Non-empty for the poc-vector-search fixture. */
  body: string;
  createdAt: string;
  updatedAt: string;
}

/** Source category for a NewsItem. */
export type NewsSource = 'rss' | 'github' | 'internal' | 'manual';

/**
 * An external news item pulled from RSS/GitHub or entered manually.
 */
export interface NewsItem {
  id: string;
  source: NewsSource;
  title: string;
  url?: string;
  /** Snippet body; longer articles live in `docs`. */
  body?: string;
  /** ISO-8601 publish time as reported by the source. */
  publishedAt?: string;
  ingestedAt: string;
}

/**
 * A long-form document (design note, ADR mirror, memo). Distinct from
 * `KnowledgeItem` which is the generic ingest surface.
 */
export interface Doc {
  id: string;
  projectId?: string;
  authorId?: string;
  title: string;
  /** Markdown body. */
  body: string;
  createdAt: string;
  updatedAt: string;
}

/** Lifecycle state for a Ticket. Deliberately closed — adding a state is an ADR. */
export type TicketStatus =
  | 'open'
  | 'in_progress'
  | 'in_review'
  | 'blocked'
  | 'done'
  | 'wont_do';

/**
 * A ticket / issue tracked in the local store (mirrors GitHub issues or is
 * hand-entered).
 */
export interface Ticket {
  id: string;
  projectId?: string;
  assigneeId?: string;
  title: string;
  status: TicketStatus;
  body?: string;
  createdAt: string;
  updatedAt: string;
}

/** Lifecycle state for a WipSignal. */
export type WipSignalStatus = 'new' | 'acknowledged' | 'stale' | 'resolved';

/**
 * A "work in progress" signal: something happening in the squad's git repos
 * that Cairn surfaces to the user. Sourced from git commit metadata.
 */
export interface WipSignal {
  id: string;
  projectId?: string;
  personId?: string;
  title: string;
  status: WipSignalStatus;
  /** Free-form details (commit sha, branch, etc.). */
  detail?: string;
  detectedAt: string;
}

/**
 * A vector row backing sqlite-vec / vec0. `embedding` is stored as a Float32
 * buffer at rest but exposed as a numeric array at the contract boundary.
 */
export interface Vector {
  id: string;
  /** e.g. 'project', 'doc', 'knowledge_item' — feeds metadata filters. */
  entityType: string;
  /** Foreign-key id into the entity table selected by `entityType`. */
  entityId: string;
  /** Float32 embedding. */
  embedding: readonly number[];
  /** Dimensionality (e.g. 768). */
  dim: number;
  /** Which model produced the embedding — kept for re-embedding logic. */
  model?: string;
  createdAt: string;
}

/**
 * A tag attached to any entity by (entityType, entityId).
 */
export interface Tag {
  id: string;
  entityType: string;
  entityId: string;
  name: string;
}

/**
 * A directed link between two entities (used by the graph view).
 */
export interface Link {
  id: string;
  sourceType: string;
  sourceId: string;
  targetType: string;
  targetId: string;
  /** Free-form label (e.g. 'mentions', 'depends-on'). */
  label?: string;
}

/**
 * A binary or large-blob attachment referenced by an entity id. The blob
 * itself is stored on disk under `resolvePaths().data/attachments/`.
 */
export interface Attachment {
  id: string;
  entityType: string;
  entityId: string;
  fileName: string;
  mimeType: string;
  /** Bytes. */
  size: number;
  /** Relative to `resolvePaths().data`. */
  storagePath: string;
  createdAt: string;
}

/**
 * A cached embedding, keyed by (model, contentHash). Prevents re-embedding
 * unchanged content.
 */
export interface EmbeddingCache {
  id: string;
  model: string;
  contentHash: string;
  embedding: readonly number[];
  createdAt: string;
}

/**
 * A key-value setting scoped to a namespace ('app', 'ui', 'sync', etc.).
 * Never used for secrets — those live in the OS keychain.
 */
export interface Setting {
  namespace: string;
  key: string;
  value: string;
  updatedAt: string;
}

/**
 * An immutable audit-log entry. Written by any code path that mutates a
 * user-visible entity.
 */
export interface AuditLogEntry {
  id: string;
  /** ISO-8601. */
  timestamp: string;
  actor: string;
  action: string;
  entityType?: string;
  entityId?: string;
  detail?: string;
}

/**
 * A user-facing session id (renderer <-> main). Not an auth session.
 */
export interface AppSession {
  id: string;
  startedAt: string;
  endedAt?: string;
}

/**
 * A generic event emitted by the app. Feeds analytics and the news feed.
 */
export interface EventRecord {
  id: string;
  timestamp: string;
  type: string;
  payload?: string;
}

/**
 * Row-level metadata index for the vector table. Kept as a companion table
 * so vec0 stays lean.
 */
export interface VectorMetadata {
  vectorId: string;
  entityType: string;
  entityId: string;
  model?: string;
  createdAt: string;
}

/**
 * Search engine — chunking, embedding, hybrid query, askDocs RAG.
 */
import { createHash } from 'node:crypto';

import type { DocsDao } from '../db/dao/docs.js';
import type { KnowledgeItemsDao } from '../db/dao/knowledge-items.js';
import type { ProjectsDao } from '../db/dao/projects.js';
import type { VectorsDao } from '../db/dao/vectors.js';
import type { AiEngine } from './ai-engine.js';
import { aiEmbedAsync } from './ai-engine.js';

export interface SearchHit {
  id: string;
  title: string;
  snippet: string;
  score: number;
  entityType: string;
}

export interface SearchEngineOptions {
  docsDao: DocsDao;
  projectsDao: ProjectsDao;
  knowledgeItemsDao: KnowledgeItemsDao;
  vectorsDao: VectorsDao;
  aiEngine: AiEngine;
  ollamaBaseUrl?: string;
}

export interface SearchEngine {
  chunkText(text: string, chunkSize?: number): string[];
  indexEntity(entityType: string, entityId: string, text: string): Promise<void>;
  query(q: string, k?: number): SearchHit[];
  askDocs(question: string): Promise<{ answer: string; sources: SearchHit[] }>;
  rebuildAll(onProgress?: (pct: number, label: string) => void): Promise<number>;
}

const DEFAULT_CHUNK = 512;

export function chunkText(text: string, chunkSize = DEFAULT_CHUNK): string[] {
  const chunks: string[] = [];
  const paragraphs = text.split(/\n{2,}/u);
  let current = '';
  for (const p of paragraphs) {
    if (current.length + p.length + 1 <= chunkSize) {
      current = current.length > 0 ? `${current}\n\n${p}` : p;
    } else {
      if (current.length > 0) chunks.push(current);
      if (p.length <= chunkSize) {
        current = p;
      } else {
        for (let i = 0; i < p.length; i += chunkSize) {
          chunks.push(p.slice(i, i + chunkSize));
        }
        current = '';
      }
    }
  }
  if (current.length > 0) chunks.push(current);
  return chunks.length > 0 ? chunks : [text.slice(0, chunkSize)];
}

export function createSearchEngine(options: SearchEngineOptions): SearchEngine {
  const { docsDao, projectsDao, knowledgeItemsDao, vectorsDao, aiEngine } = options;
  const ollamaBase = options.ollamaBaseUrl ?? 'http://127.0.0.1:11434';

  function keywordSearch(q: string): SearchHit[] {
    const lower = q.toLowerCase();
    const hits: SearchHit[] = [];

    for (const doc of docsDao.list()) {
      const content = (doc as { content?: string | null }).content ?? doc.title;
      const text = `${doc.title} ${content}`.toLowerCase();
      if (text.includes(lower)) {
        hits.push({
          id: doc.id,
          title: doc.title,
          snippet: String(content).slice(0, 120),
          score: 0.85,
          entityType: 'doc',
        });
      }
    }
    for (const project of projectsDao.list()) {
      const text = `${project.name} ${project.description ?? ''}`.toLowerCase();
      if (text.includes(lower)) {
        hits.push({
          id: project.id,
          title: project.name,
          snippet: project.description ?? '',
          score: 0.8,
          entityType: 'project',
        });
      }
    }
    for (const item of knowledgeItemsDao.list()) {
      if (item.content.toLowerCase().includes(lower)) {
        hits.push({
          id: item.id,
          title: item.type,
          snippet: item.content.slice(0, 120),
          score: 0.7,
          entityType: 'knowledge',
        });
      }
    }
    return hits;
  }

  async function indexEntity(entityType: string, entityId: string, text: string): Promise<void> {
    const chunks = chunkText(text);
    for (let i = 0; i < chunks.length; i += 1) {
      const chunkId = `${entityId}#${String(i)}`;
      const embedding = await aiEmbedAsync(aiEngine, chunks[i], ollamaBase);
      vectorsDao.upsert({ entityId: chunkId, entityType, embedding });
    }
  }

  function query(q: string, k = 20): SearchHit[] {
    const keywordHits = keywordSearch(q);
    const queryEmbed = aiEngine.embed(q);
    if (!queryEmbed.ok) {
      return keywordHits.slice(0, k);
    }

    const vectorHits = vectorsDao.topK(queryEmbed.data.embedding, k);
    const merged = new Map<string, SearchHit>();

    for (const hit of keywordHits) {
      merged.set(`${hit.entityType}:${hit.id}`, hit);
    }

    for (const v of vectorHits) {
      const baseId = v.entityId.split('#')[0] ?? v.entityId;
      const key = `${v.entityType}:${baseId}`;
      if (merged.has(key)) {
        const existing = merged.get(key)!;
        existing.score = Math.max(existing.score, 1 - v.distance);
      } else {
        let title = baseId;
        let snippet = '';
        if (v.entityType === 'doc') {
          const doc = docsDao.get(baseId);
          if (doc !== undefined) {
            title = doc.title;
            snippet = doc.title;
          }
        } else if (v.entityType === 'project') {
          const project = projectsDao.get(baseId);
          if (project !== undefined) {
            title = project.name;
            snippet = project.description ?? '';
          }
        }
        merged.set(key, {
          id: baseId,
          title,
          snippet,
          score: 1 - v.distance,
          entityType: v.entityType,
        });
      }
    }

    return [...merged.values()].sort((a, b) => b.score - a.score).slice(0, k);
  }

  async function askDocs(question: string): Promise<{ answer: string; sources: SearchHit[] }> {
    const sources = query(question, 5);
    const context = sources.map((s) => `- ${s.title}: ${s.snippet}`).join('\n');
    const prompt = `Answer the question using only the context below.\n\nContext:\n${context}\n\nQuestion: ${question}`;
    const result = await aiEngine.complete({ prompt, taskType: 'doc.qa' });
    const answer = result.ok ? result.data.text : 'Unable to generate an answer — AI unavailable.';
    return { answer, sources };
  }

  async function rebuildAll(onProgress?: (pct: number, label: string) => void): Promise<number> {
    const docs = docsDao.list();
    const projects = projectsDao.list();
    const knowledge = knowledgeItemsDao.list();
    const total = docs.length + projects.length + knowledge.length;
    let done = 0;

    for (const doc of docs) {
      const content = (doc as { content?: string | null }).content ?? doc.title;
      await indexEntity('doc', doc.id, String(content));
      done += 1;
      onProgress?.(Math.round((done / Math.max(total, 1)) * 100), `Indexed doc ${doc.title}`);
    }
    for (const project of projects) {
      await indexEntity('project', project.id, `${project.name}\n${project.description ?? ''}`);
      done += 1;
      onProgress?.(Math.round((done / Math.max(total, 1)) * 100), `Indexed project ${project.name}`);
    }
    for (const item of knowledge) {
      await indexEntity('knowledge', item.id, item.content);
      done += 1;
      onProgress?.(Math.round((done / Math.max(total, 1)) * 100), `Indexed knowledge ${item.type}`);
    }
    return done;
  }

  return { chunkText, indexEntity, query, askDocs, rebuildAll };
}

export function searchCacheKey(q: string): string {
  return createHash('sha256').update(q).digest('hex').slice(0, 16);
}

export function hybridScore(keywordScore: number, vectorScore: number): number {
  return keywordScore * 0.4 + vectorScore * 0.6;
}

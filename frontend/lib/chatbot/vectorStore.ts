import 'server-only';

import { createHash } from 'node:crypto';

import { RAG_MIN_SCORE, RAG_TOP_K } from './config';
import { query, queryOne, toVector, withTransaction } from './db';

export function hashContent(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

/* ------------------------------------------------------------------ upsert */

export interface UpsertResult {
  status: 'skipped' | 'inserted' | 'updated';
  chunkCount: number;
}

export interface UpsertInput {
  url: string;
  title: string;
  /** Full extracted page text — hashed to decide whether re-embedding is needed. */
  content: string;
  chunks: string[];
  /**
   * Invoked ONLY when the content actually changed. Passing a callback rather
   * than pre-computed vectors is what keeps re-ingestion cheap: an unchanged
   * page costs one SELECT and zero Gemini calls.
   */
  embed: (chunks: string[]) => Promise<number[][]>;
  /** Re-embed even if the hash matches. Use after changing the embedding model. */
  force?: boolean;
}

/**
 * Idempotent document upsert.
 *
 * Embedding happens OUTSIDE the transaction — it is a slow network call, and
 * holding a Postgres connection open across it would pin a pooler slot for
 * seconds per page. The write itself is then atomic: delete old chunks, insert
 * new ones, stamp the hash, all or nothing. A crash mid-run leaves the previous
 * version fully intact rather than a document with missing chunks.
 */
export async function upsertDocumentWithChunks(input: UpsertInput): Promise<UpsertResult> {
  const { url, title, content, chunks, embed, force = false } = input;
  const contentHash = hashContent(content);

  const existing = await queryOne<{ id: string; content_hash: string }>(
    `select id, content_hash from chatbot_documents where url = $1`,
    [url],
  );

  if (existing && existing.content_hash === contentHash && !force) {
    return { status: 'skipped', chunkCount: 0 };
  }

  const embeddings = await embed(chunks);
  if (embeddings.length !== chunks.length) {
    throw new Error(
      `Embedding count mismatch for ${url}: ${chunks.length} chunks, ${embeddings.length} vectors.`,
    );
  }

  await withTransaction(async (client) => {
    const { rows } = await client.query<{ id: string }>(
      `insert into chatbot_documents (url, title, content_hash, char_count, chunk_count, updated_at)
       values ($1, $2, $3, $4, $5, now())
       on conflict (url) do update
         set title        = excluded.title,
             content_hash = excluded.content_hash,
             char_count   = excluded.char_count,
             chunk_count  = excluded.chunk_count,
             updated_at   = now()
       returning id`,
      [url, title, contentHash, content.length, chunks.length],
    );

    const documentId = rows[0].id;

    await client.query(`delete from chatbot_doc_chunks where document_id = $1`, [documentId]);

    for (let index = 0; index < chunks.length; index++) {
      await client.query(
        `insert into chatbot_doc_chunks (document_id, chunk_index, content, embedding)
         values ($1, $2, $3, $4::vector)`,
        [documentId, index, chunks[index], toVector(embeddings[index])],
      );
    }
  });

  return { status: existing ? 'updated' : 'inserted', chunkCount: chunks.length };
}

/**
 * Drop documents that are no longer in the sitemap, so a deleted blog post
 * stops being cited. Chunks cascade.
 */
export async function pruneDocuments(keepUrls: string[]): Promise<number> {
  if (keepUrls.length === 0) return 0;

  const rows = await query<{ id: string }>(
    `delete from chatbot_documents where not (url = any($1::text[])) returning id`,
    [keepUrls],
  );

  return rows.length;
}

/* --------------------------------------------------------------- retrieval */

export interface MatchedChunk {
  id: string;
  documentId: string;
  url: string;
  title: string;
  content: string;
  similarity: number;
}

/**
 * Top-K cosine search.
 *
 * pgvector's `<=>` is cosine DISTANCE (0 = identical), so similarity is
 * 1 - distance. Ordering by the raw distance operator is what lets the HNSW
 * index serve the query; ordering by the computed similarity would not.
 */
export async function matchChunks(
  queryEmbedding: number[],
  topK: number = RAG_TOP_K,
  minScore: number = RAG_MIN_SCORE,
): Promise<MatchedChunk[]> {
  const rows = await query<{
    id: string;
    document_id: string;
    url: string;
    title: string;
    content: string;
    similarity: string | number;
  }>(
    `select c.id,
            c.document_id,
            d.url,
            d.title,
            c.content,
            1 - (c.embedding <=> $1::vector) as similarity
       from chatbot_doc_chunks c
       join chatbot_documents d on d.id = c.document_id
      where 1 - (c.embedding <=> $1::vector) >= $3
      order by c.embedding <=> $1::vector
      limit $2`,
    [toVector(queryEmbedding), topK, minScore],
  );

  return rows.map((row) => ({
    id: row.id,
    documentId: row.document_id,
    url: row.url,
    title: row.title,
    content: row.content,
    similarity: Number(row.similarity),
  }));
}

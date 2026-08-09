const { createHash } = require('crypto');

const { RAG_MIN_SCORE, RAG_TOP_K } = require('./config');
const { query, queryOne, toVector, withTransaction } = require('./db');

function hashContent(content) {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

/* ------------------------------------------------------------------ upsert */

/**
 * Idempotent document upsert.
 *
 * Embedding happens OUTSIDE the transaction — it is a slow network call and
 * holding a Postgres connection across it would pin a pooler slot for seconds
 * per page. The write itself is atomic: delete old chunks, insert new, stamp
 * the hash, all or nothing.
 */
async function upsertDocumentWithChunks({ url, title, content, chunks, embed, force = false }) {
  const contentHash = hashContent(content);

  const existing = await queryOne(
    'select id, content_hash from chatbot_documents where url = $1',
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
    const { rows } = await client.query(
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

    await client.query('delete from chatbot_doc_chunks where document_id = $1', [documentId]);

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

/** Drop documents no longer in the sitemap so deleted pages stop being cited. */
async function pruneDocuments(keepUrls) {
  if (!keepUrls.length) return 0;

  const rows = await query(
    'delete from chatbot_documents where not (url = any($1::text[])) returning id',
    [keepUrls],
  );

  return rows.length;
}

/* --------------------------------------------------------------- retrieval */

/**
 * Top-K cosine search.
 *
 * pgvector's `<=>` is cosine DISTANCE (0 = identical), so similarity is
 * 1 - distance. Ordering by the raw operator is what lets the HNSW index serve
 * the query; ordering by the computed similarity would not.
 */
async function matchChunks(queryEmbedding, topK = RAG_TOP_K, minScore = RAG_MIN_SCORE) {
  const rows = await query(
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

module.exports = { hashContent, upsertDocumentWithChunks, pruneDocuments, matchChunks };

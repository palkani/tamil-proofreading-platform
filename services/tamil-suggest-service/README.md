# Tamil Suggest Service (Node/TypeScript)

Production-oriented Tamil typing suggestion service intended to be deployed on Cloud Run.

## API

`GET /api/suggest?q=vanakk&prev=வணக்கம்&limit=10`

Response:

```json
{
  "suggestions": [
    { "text": "வணக்கம்", "score": 98 },
    { "text": "வணக்கங்கள்", "score": 90 }
  ],
  "meta": { "q": "vanakk", "limit": 10, "took_ms": 12 }
}
```

## Environment

- `PORT` (default `8080`)
- `DATABASE_URL` (Postgres)
- `SUGGEST_TOP_K` (max rows loaded into memory per table; default `50000`)
- `CACHE_SIZE` (default `5000`)
- `CACHE_TTL_MS` (default `10000`)

## Notes

- The service is designed to be **stateless**; it loads a compact in-memory prefix index at startup.
- For development/testing without Postgres, you can set `DATA_DIR` to a folder containing:
  - `seed_words.tsv` (columns: `text\tfrequency`)
  - `seed_phrases.tsv` (columns: `text\tfrequency`)
  - `seed_bigrams.tsv` (columns: `word\tnext_word\tfrequency`)



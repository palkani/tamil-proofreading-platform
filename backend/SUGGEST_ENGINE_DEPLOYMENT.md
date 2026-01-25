## Cloud Run Deployment (Suggest Engine v3.1)

### Build + Deploy
```bash
gcloud run deploy tamil-proofreading-backend \
  --source=backend \
  --region=asia-south1 \
  --memory=1Gi \
  --cpu=1 \
  --concurrency=60 \
  --min-instances=1 \
  --set-env-vars="SUGGEST_MIN_LEN=2,SUGGEST_TOP_K=5,SUGGEST_TRIE_TOP_K=25,SUGGEST_CACHE_ENTRIES=200,SUGGEST_CACHE_TTL_MS=120000,LEXICON_REFRESH_SEC=600,SUGGEST_VOWEL_COLLAPSE=false,SUGGEST_REDIS_TIMEOUT_MS=25"
```

### Recommended Settings
- **min instances:** 1 (avoid cold starts)
- **memory:** 1Gi for >100k words
- **concurrency:** 40–80
- **CPU always on:** recommended for low p95

### Optional Redis
```bash
--set-env-vars="REDIS_URL=redis://user:pass@host:6379/0"
```

### Health + Metrics
- `GET /healthz` → trie loaded + lexicon count
- `GET /metrics-lite` → p50/p95 snapshot

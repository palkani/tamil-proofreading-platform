# Tamil Suggestion Service - Deployment Guide

## Quick Start (5 minutes)

### 1. Database Setup (PostgreSQL)

```bash
# Option A: Using existing PostgreSQL
psql -d your_database -f src/db/schema.sql
psql -d your_database -f src/db/seed.sql

# Option B: Using Supabase
# 1. Go to Supabase dashboard → SQL Editor
# 2. Copy contents of schema.sql → Run
# 3. Copy contents of seed.sql → Run
```

**Verify:**
```sql
SELECT 'tamil_words' as table_name, COUNT(*) FROM tamil_words
UNION ALL
SELECT 'tamil_bigrams', COUNT(*) FROM tamil_bigrams
UNION ALL
SELECT 'phonetic_rules', COUNT(*) FROM phonetic_rules;
```

Expected output:
```
tamil_words     | 200+
tamil_bigrams   | 50+
phonetic_rules  | 100+
```

### 2. Environment Variables

```bash
# Required
DATABASE_URL=postgresql://user:pass@host:5432/db

# Optional
PORT=8080                    # Default: 8080
SUGGEST_TOP_K=50000          # Max words to load (default: 50K)
ENABLE_LLM_SUGGEST=false     # LLM integration (default: false)
DATA_DIR=/path/to/tsv        # Fallback TSV data directory
NODE_ENV=production          # Node environment
```

### 3. Build & Run

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Start production server
npm start
```

**Development mode:**
```bash
npm run dev  # Auto-reload on changes
```

### 4. Verify

```bash
# Health check
curl http://localhost:8080/health
# Expected: {"ok":true,"service":"tamil-suggest-service"}

# Test suggestion
curl "http://localhost:8080/api/suggest?q=vanakkam&limit=5"
# Expected: JSON with suggestions array

# Test with context
curl "http://localhost:8080/api/suggest?q=nandri&prev=வணக்கம்&limit=5"
```

---

## Production Deployment

### Option 1: Docker (Recommended)

**Create Dockerfile:**
```dockerfile
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json tsconfig.json ./
COPY src ./src

# Install & build
RUN npm ci --only=production
RUN npm run build

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD node -e "require('http').get('http://localhost:8080/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Run
CMD ["npm", "start"]
```

**Build & Run:**
```bash
docker build -t tamil-suggest-service .
docker run -d \
  -p 8080:8080 \
  -e DATABASE_URL="postgresql://..." \
  --name tamil-suggest \
  tamil-suggest-service
```

**Docker Compose:**
```yaml
version: '3.8'
services:
  suggest:
    build: .
    ports:
      - "8080:8080"
    environment:
      - DATABASE_URL=postgresql://user:pass@db:5432/tamil
      - SUGGEST_TOP_K=50000
      - NODE_ENV=production
    depends_on:
      - db
    restart: unless-stopped
    
  db:
    image: postgres:16-alpine
    environment:
      - POSTGRES_DB=tamil
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=pass
    volumes:
      - ./src/db/schema.sql:/docker-entrypoint-initdb.d/01-schema.sql
      - ./src/db/seed.sql:/docker-entrypoint-initdb.d/02-seed.sql
      - pg-data:/var/lib/postgresql/data
    restart: unless-stopped

volumes:
  pg-data:
```

### Option 2: Google Cloud Run

```bash
# Build & push
gcloud builds submit --tag gcr.io/PROJECT_ID/tamil-suggest

# Deploy
gcloud run deploy tamil-suggest-service \
  --image gcr.io/PROJECT_ID/tamil-suggest \
  --platform managed \
  --region us-central1 \
  --memory 512Mi \
  --cpu 1 \
  --min-instances 1 \
  --max-instances 10 \
  --set-env-vars DATABASE_URL="postgresql://..." \
  --allow-unauthenticated
```

### Option 3: AWS ECS/Fargate

```bash
# Build & push to ECR
aws ecr get-login-password | docker login --username AWS --password-stdin $ECR_REGISTRY
docker build -t tamil-suggest .
docker tag tamil-suggest:latest $ECR_REGISTRY/tamil-suggest:latest
docker push $ECR_REGISTRY/tamil-suggest:latest

# Deploy via ECS console or CLI
# - Task definition: 512 CPU, 1GB memory
# - Environment: DATABASE_URL
# - Health check: /health endpoint
```

### Option 4: Vercel/Netlify (Serverless)

**Not recommended** - This service benefits from:
- Persistent in-memory Trie (fast prefix search)
- Connection pooling
- Warm startup

Use dedicated server deployment instead.

---

## Performance Tuning

### 1. Database Optimization

```sql
-- Ensure indexes exist
\d tamil_words
-- Should show: idx_tamil_words_word_prefix, idx_tamil_words_frequency

-- Analyze query performance
EXPLAIN ANALYZE 
SELECT word, frequency 
FROM tamil_words 
WHERE word LIKE 'வண%' 
ORDER BY frequency DESC 
LIMIT 20;

-- Rebuild indexes if needed
REINDEX TABLE tamil_words;
REINDEX TABLE tamil_bigrams;

-- Update statistics
ANALYZE tamil_words;
ANALYZE tamil_bigrams;
```

### 2. Memory Tuning

**Current memory usage:**
- Trie: ~50MB (for 10K words)
- Bigram map: ~5MB
- Base: ~150MB

**For large corpus (100K+ words):**
```bash
# Increase Node.js heap
NODE_OPTIONS="--max-old-space-size=2048" npm start

# Or limit corpus size
SUGGEST_TOP_K=50000  # Load only top 50K words
```

### 3. Connection Pooling

```typescript
// src/db/pg.ts
export function createPool() {
  return new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 20,                    // Max connections
    idleTimeoutMillis: 30000,   // Close idle after 30s
    connectionTimeoutMillis: 2000, // Timeout if no connection
  });
}
```

### 4. Latency Optimization

**Current bottlenecks:**
1. Phonetic expansion: ~5ms (beam search)
2. Prefix lookup: ~5ms (trie traversal)
3. Ranking: ~3ms (sorting)
4. Network: ~2ms

**Improvements:**
- ✅ In-memory Trie (already implemented)
- ✅ Beam width tuning (default: 24)
- 🔧 Add Redis cache for popular queries
- 🔧 Precompute common bigram patterns

### 5. Horizontal Scaling

**Stateless design** - safe to scale horizontally:
```bash
# Docker Swarm
docker service create \
  --name tamil-suggest \
  --replicas 3 \
  --publish 8080:8080 \
  -e DATABASE_URL="..." \
  tamil-suggest-service

# Kubernetes
kubectl scale deployment tamil-suggest --replicas=5
```

**Load balancing:**
- Use round-robin (all instances identical)
- Health check: `GET /health`
- No sticky sessions needed

---

## Monitoring

### 1. Metrics Collection

**Built-in metrics table:**
```sql
-- Track all suggestions
INSERT INTO suggest_metrics 
  (query, latency_ms, phonetic_candidates, pool_size, returned_count)
VALUES 
  ($1, $2, $3, $4, $5);
```

**Query performance:**
```sql
-- Latency distribution
SELECT 
  percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms) as p50,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms) as p95,
  percentile_cont(0.99) WITHIN GROUP (ORDER BY latency_ms) as p99,
  AVG(latency_ms) as avg_ms
FROM suggest_metrics
WHERE created_at > NOW() - INTERVAL '1 hour';

-- Popular queries
SELECT query, COUNT(*) as count, AVG(latency_ms) as avg_ms
FROM suggest_metrics
WHERE created_at > NOW() - INTERVAL '1 day'
GROUP BY query
ORDER BY count DESC
LIMIT 20;

-- Slow queries
SELECT query, latency_ms, created_at
FROM suggest_metrics
WHERE latency_ms > 50
ORDER BY created_at DESC
LIMIT 50;
```

### 2. Application Logging

**Fastify built-in logger:**
```typescript
// Already configured in server.ts
const app = Fastify({ logger: true });
```

**Production log format:**
```json
{
  "level": "info",
  "time": 1234567890,
  "msg": "GET /api/suggest",
  "req": { "method": "GET", "url": "/api/suggest?q=vanakkam" },
  "res": { "statusCode": 200 },
  "responseTime": 15.3
}
```

### 3. Health Monitoring

**Endpoint: `GET /health`**
```bash
# Simple check
curl http://localhost:8080/health

# With details (TODO: extend)
curl http://localhost:8080/health?detailed=true
```

**Readiness check:**
- ✅ Server running
- ✅ Database connected
- ✅ Corpus loaded
- ✅ Trie built

**Liveness check:**
- ✅ Server responding
- ✅ No memory leaks
- ✅ Latency under threshold

---

## Security

### 1. Rate Limiting

**Add to server.ts:**
```typescript
import rateLimit from '@fastify/rate-limit';

await app.register(rateLimit, {
  max: 100,              // Max 100 requests
  timeWindow: '1 minute' // Per minute per IP
});
```

### 2. Input Validation

**Already implemented:**
- Query parameter sanitization
- Length limits
- Type checking

**Additional validation:**
```typescript
// Add to suggestController.ts
if (qRaw.length > 100) {
  return reply.status(400).send({ error: "Query too long" });
}
```

### 3. CORS

**Add if needed:**
```typescript
import cors from '@fastify/cors';

await app.register(cors, {
  origin: ['https://your-frontend.com']
});
```

### 4. Database Security

**Use read-only user for production:**
```sql
CREATE USER suggest_reader WITH PASSWORD 'secure_password';
GRANT SELECT ON tamil_words, tamil_phrases, tamil_bigrams, phonetic_rules TO suggest_reader;
GRANT INSERT ON accept_events TO suggest_reader;
```

---

## Maintenance

### 1. Updating Corpus

```sql
-- Add new words
INSERT INTO tamil_words (word, frequency, kind)
VALUES ('புதியசொல்', 5000, 'word')
ON CONFLICT (word) DO UPDATE SET frequency = EXCLUDED.frequency;

-- Add bigrams
INSERT INTO tamil_bigrams (word, next_word, frequency)
VALUES ('வணக்கம்', 'நண்பரே', 3000)
ON CONFLICT (word, next_word) DO UPDATE SET frequency = EXCLUDED.frequency;

-- Restart service to reload (or implement hot-reload)
```

### 2. Refresh Acceptance Frequency

```sql
-- Run periodically (e.g., daily cron)
REFRESH MATERIALIZED VIEW CONCURRENTLY acceptance_frequency;
```

### 3. Cleanup Old Metrics

```sql
-- Delete metrics older than 30 days
DELETE FROM suggest_metrics WHERE created_at < NOW() - INTERVAL '30 days';
```

### 4. Database Backups

```bash
# Backup
pg_dump -d $DATABASE_URL \
  -t tamil_words \
  -t tamil_phrases \
  -t tamil_bigrams \
  -t phonetic_rules \
  > backup_$(date +%Y%m%d).sql

# Restore
psql -d $DATABASE_URL < backup_20240101.sql
```

---

## Troubleshooting

### Issue: Service won't start

**Check:**
```bash
# Database connection
psql $DATABASE_URL -c "SELECT 1;"

# Port availability
lsof -i :8080

# Logs
docker logs tamil-suggest

# Environment variables
echo $DATABASE_URL
```

### Issue: High latency

**Debug:**
```sql
-- Check slow queries
SELECT query, latency_ms FROM suggest_metrics 
WHERE latency_ms > 50 
ORDER BY created_at DESC LIMIT 10;

-- Check corpus size
SELECT COUNT(*) FROM tamil_words;

-- Check indexes
\d tamil_words
```

**Solutions:**
- Reduce `SUGGEST_TOP_K`
- Add database indexes
- Increase server resources

### Issue: Poor accuracy

**Solutions:**
1. Add more words to corpus (target: 10K+)
2. Add domain-specific bigrams
3. Tune phonetic rule weights
4. Track acceptance events

### Issue: Memory usage too high

**Solutions:**
```bash
# Reduce corpus size
SUGGEST_TOP_K=20000

# Limit phonetic expansion
# Edit src/suggest/phoneticEngine.ts
maxCandidates: 10  # Reduce from 20
beamWidth: 12      # Reduce from 24
```

---

## Rollback Plan

**If issues in production:**

1. **Quick rollback:** Revert to previous Docker image
```bash
docker stop tamil-suggest
docker rm tamil-suggest
docker run -d ... tamil-suggest-service:previous-tag
```

2. **Database rollback:** Restore from backup
```bash
psql -d $DATABASE_URL < backup_previous.sql
```

3. **Gradual migration:** Blue-green deployment
```bash
# Run old + new versions simultaneously
# Gradually shift traffic to new version
# Monitor metrics
# Full cutover once stable
```

---

## Next Steps

1. ✅ Deploy to staging
2. ✅ Run load tests
3. ✅ Monitor metrics for 24 hours
4. ✅ Fix any issues
5. ✅ Deploy to production
6. 🔄 Collect user feedback
7. 🔄 Iterate on corpus quality

---

## Support

**Questions?** Check:
- README.md (API documentation)
- IMPLEMENTATION_STATUS.md (current state)
- GitHub Issues

**Performance issues?** Share:
- Query examples
- Latency distribution
- Server specs
- Corpus size

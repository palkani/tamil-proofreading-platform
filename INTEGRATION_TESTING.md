# Tamil Suggestion Service - Integration Testing Guide

## ✅ Integration Complete

The advanced Tamil suggestion service has been integrated as an internal microservice.

---

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────┐
│  Go Backend (Gin) - Port 8080                    │
│  GET /api/v1/ime/suggest                         │
│                                                   │
│  ┌─────────────────────────────────────────────┐│
│  │ Handler Logic (ime_handlers.go)             ││
│  │                                              ││
│  │ 1. Try Advanced Service (if enabled)        ││
│  │    ↓ HTTP Call                               ││
│  │    └→ http://suggest-service:8080/api/suggest││
│  │                                              ││
│  │ 2. Fallback to Aksharamukha (if failed)     ││
│  │    └→ existing ime.Service                   ││
│  └─────────────────────────────────────────────┘│
└──────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────┐
│  TypeScript Microservice - Port 8081             │
│  (backend/services/suggest-service/)             │
│                                                   │
│  GET /api/suggest                                 │
│  - 5-factor ranking formula                      │
│  - Context boost (bigrams)                       │
│  - Phrase detection                              │
│  - User learning                                 │
└──────────────────────────────────────────────────┘

           Both connect to same PostgreSQL
```

---

## 🚀 Quick Start

### 1. **Build & Start Services**

```bash
cd /Users/palkanirajendran/Documents/Palkani/SAAS_IDEAS/tamil-proofreading-platform

# Build all services
docker-compose build

# Start with advanced service DISABLED (safe rollout)
docker-compose up -d

# Check all services are running
docker-compose ps
```

Expected output:
```
NAME                 STATUS              PORTS
backend              Up (healthy)        0.0.0.0:8080->8080/tcp
suggest-service      Up (healthy)        0.0.0.0:8081->8080/tcp
db                   Up (healthy)        0.0.0.0:5432->5432/tcp
frontend             Up                  0.0.0.0:5000->5000/tcp
```

### 2. **Verify Health**

```bash
# Backend health
curl http://localhost:8080/health
# Expected: {"status":"ok"}

# Suggest service health
curl http://localhost:8081/health
# Expected: {"ok":true,"service":"tamil-suggest-service"}

# Database connection
docker-compose exec db psql -U prooftamil -d prooftamil_local -c "SELECT COUNT(*) FROM tamil_words;"
```

---

## 🧪 Testing

### Test 1: Basic IME (Aksharamukha - Default)

```bash
# With advanced service DISABLED (default)
curl "http://localhost:8080/api/v1/ime/suggest?q=vanakkam&limit=5"
```

**Expected Response:**
```json
{
  "success": true,
  "query": "vanakkam",
  "mode": "spoken",
  "suggestions": [
    {
      "word": "வணக்கம்",
      "score": 95,
      "source": "corpus",
      "rank_reason": "..."
    }
  ],
  "meta": {
    "engine": "aksharamukha",
    "used_advanced": false,
    "latency_ms": 25
  }
}
```

### Test 2: Enable Advanced Service

```bash
# Method 1: Environment variable
export USE_ADVANCED_SUGGEST=true
docker-compose restart backend

# Method 2: Update docker-compose.yml
# Change: USE_ADVANCED_SUGGEST=true
docker-compose up -d backend
```

### Test 3: Advanced Service (5-Factor Ranking)

```bash
# After enabling advanced service
curl "http://localhost:8080/api/v1/ime/suggest?q=vanakkam&limit=5"
```

**Expected Response:**
```json
{
  "success": true,
  "query": "vanakkam",
  "suggestions": [
    {
      "word": "வணக்கம்",
      "score": 98,
      "source": "advanced-5factor",
      "rank_reason": "rank_1_score_98.5"
    },
    {
      "word": "வணக்கம்!",
      "score": 94,
      "source": "advanced-5factor",
      "rank_reason": "rank_2_score_94.2"
    }
  ],
  "meta": {
    "engine": "advanced",
    "algorithm": "5-factor-formula",
    "used_advanced": true,
    "latency_ms": 18,
    "branches": 4,
    "candidates": 42
  }
}
```

### Test 4: Context Awareness (Bigrams)

```bash
# With previous word context
curl "http://localhost:8080/api/v1/ime/suggest?q=nandri&prev=வணக்கம்&limit=5"
```

**Expected:**
- Higher scores for contextually relevant words
- `நன்றி` boosted due to bigram: `வணக்கம் → நன்றி`

### Test 5: Fallback Mechanism

```bash
# Stop suggest service
docker-compose stop suggest-service

# Request should still work (fallback to Aksharamukha)
curl "http://localhost:8080/api/v1/ime/suggest?q=vanakkam&limit=5"

# Check logs
docker-compose logs backend | grep "advanced_fallback"
# Expected: "event=advanced_fallback ... using basic service"

# Restart suggest service
docker-compose start suggest-service
```

### Test 6: Direct Microservice Access

```bash
# Call suggest-service directly
curl "http://localhost:8081/api/suggest?q=vanakkam&limit=5"
```

**Expected:**
```json
{
  "suggestions": [
    { "text": "வணக்கம்", "score": 98.5 },
    { "text": "வணக்கம்!", "score": 94.2 }
  ],
  "meta": {
    "q": "vanakkam",
    "branches": 4,
    "candidates": 42,
    "took_ms": 15.3,
    "usedLLM": false
  }
}
```

---

## 📊 Performance Benchmarks

### Latency Comparison

```bash
# Benchmark script
for i in {1..10}; do
  curl -w "\nTime: %{time_total}s\n" \
    "http://localhost:8080/api/v1/ime/suggest?q=vanakkam&limit=5" \
    -o /dev/null -s
done
```

**Expected Results:**

| Service | p50 | p99 | Status |
|---------|-----|-----|--------|
| **Basic (Aksharamukha)** | ~50ms | ~80ms | ✅ |
| **Advanced (5-factor)** | ~20ms | ~30ms | ✅ Faster! |

### Accuracy Testing

```bash
# Test common words
curl "http://localhost:8080/api/v1/ime/suggest?q=vanakkam"
curl "http://localhost:8080/api/v1/ime/suggest?q=nandri"
curl "http://localhost:8080/api/v1/ime/suggest?q=thimuk"  # Political term

# Test with context
curl "http://localhost:8080/api/v1/ime/suggest?q=nandri&prev=வணக்கம்"

# Test long phrases
curl "http://localhost:8080/api/v1/ime/suggest?q=eppadiirukkeerkal"
```

---

## 🔍 Monitoring

### View Logs

```bash
# All services
docker-compose logs -f

# Backend only
docker-compose logs -f backend

# Suggest service only
docker-compose logs -f suggest-service

# Filter for IME events
docker-compose logs backend | grep "\[IME\]"
```

**Important Log Messages:**

```
✅ Good:
[IME] Advanced suggestion service enabled: http://suggest-service:8080 ✓
[IME] event=advanced_success q="vanakkam" count=5 latency_ms=18

⚠️ Warning (will fallback):
[IME] event=advanced_fallback q="vanakkam" error=... - using basic service

❌ Error (check config):
[IME] Advanced suggestion service not configured
```

### Database Queries

```bash
# Check corpus size
docker-compose exec db psql -U prooftamil -d prooftamil_local -c \
  "SELECT 'tamil_words' as table, COUNT(*) FROM tamil_words
   UNION ALL
   SELECT 'tamil_bigrams', COUNT(*) FROM tamil_bigrams
   UNION ALL
   SELECT 'phonetic_rules', COUNT(*) FROM phonetic_rules;"

# Check recent suggestions (if logging enabled)
docker-compose exec db psql -U prooftamil -d prooftamil_local -c \
  "SELECT query, COUNT(*) as requests, AVG(latency_ms) as avg_latency
   FROM suggest_metrics
   WHERE created_at > NOW() - INTERVAL '1 hour'
   GROUP BY query
   ORDER BY requests DESC
   LIMIT 10;"
```

---

## 🎛️ Feature Flag Control

### Disable Advanced (Rollback)

```bash
# Set environment variable
export USE_ADVANCED_SUGGEST=false

# Restart backend
docker-compose restart backend

# Verify fallback
curl "http://localhost:8080/api/v1/ime/suggest?q=vanakkam"
# Should show: "used_advanced": false
```

### Enable Advanced

```bash
# Set environment variable
export USE_ADVANCED_SUGGEST=true

# Restart backend
docker-compose restart backend

# Verify advanced
curl "http://localhost:8080/api/v1/ime/suggest?q=vanakkam"
# Should show: "used_advanced": true, "engine": "advanced"
```

### Gradual Rollout (Production)

```bash
# Week 1: Deploy with advanced DISABLED
USE_ADVANCED_SUGGEST=false

# Week 2: Enable for 10% traffic (load balancer level)
# Week 3: Enable for 50% traffic
# Week 4: Enable for 100% traffic
USE_ADVANCED_SUGGEST=true
```

---

## 🐛 Troubleshooting

### Issue: Suggest service won't start

**Check:**
```bash
docker-compose logs suggest-service

# Common issues:
# 1. Port 8081 already in use
lsof -i :8081

# 2. Database connection failed
docker-compose exec suggest-service env | grep DATABASE_URL

# 3. Missing dependencies
docker-compose exec suggest-service ls -la node_modules
```

**Fix:**
```bash
docker-compose down
docker-compose build --no-cache suggest-service
docker-compose up -d
```

### Issue: Advanced service not being called

**Check config:**
```bash
docker-compose exec backend env | grep ADVANCED
# Should show:
# ADVANCED_SUGGEST_URL=http://suggest-service:8080
# USE_ADVANCED_SUGGEST=true

# Check logs
docker-compose logs backend | grep "Advanced suggestion"
```

**Fix:**
```bash
# Verify environment variables set
export USE_ADVANCED_SUGGEST=true
docker-compose restart backend
```

### Issue: High latency

**Debug:**
```bash
# Check suggest service health
curl http://localhost:8081/health

# Check database connection
docker-compose exec suggest-service \
  psql $DATABASE_URL -c "SELECT COUNT(*) FROM tamil_words;"

# Check network
docker-compose exec backend ping suggest-service
```

---

## 📈 Success Criteria

- ✅ All services start and pass health checks
- ✅ Basic IME works (with advanced disabled)
- ✅ Advanced IME works (when enabled)
- ✅ Fallback works (when suggest-service down)
- ✅ Latency <30ms (p99)
- ✅ No errors in logs
- ✅ Context awareness working (bigrams)

---

## 🚀 Production Deployment

### Environment Variables

```bash
# .env.production
DATABASE_URL=postgresql://user:pass@prod-db:5432/tamil
ADVANCED_SUGGEST_URL=http://suggest-service:8080
USE_ADVANCED_SUGGEST=true  # After validation

# Security
JWT_SECRET=strong-random-secret
GOOGLE_GENAI_API_KEY=your-production-key
```

### Docker Compose (Production)

```yaml
services:
  backend:
    image: your-registry/prooftamil-backend:latest
    environment:
      - USE_ADVANCED_SUGGEST=true
    deploy:
      replicas: 3
      
  suggest-service:
    image: your-registry/suggest-service:latest
    deploy:
      replicas: 2
```

### Health Monitoring

```bash
# Add to monitoring (Prometheus, Datadog, etc.)
/api/v1/ime/suggest?q=test  # Response time
/health                      # Service health
```

---

## 🎉 Next Steps

1. ✅ **Run all tests above**
2. ✅ **Monitor logs for 24 hours**
3. ✅ **Collect accuracy metrics**
4. ✅ **Compare with existing IME**
5. ✅ **Enable in production when stable**

---

## 📞 Support

**Issues?** Check:
1. Docker logs: `docker-compose logs -f`
2. Service health: `curl localhost:8080/health`
3. Database connection: `docker-compose exec db psql ...`
4. Environment variables: `docker-compose config`

**Performance issues?** Share:
- Query examples
- Latency distribution
- Logs from both services

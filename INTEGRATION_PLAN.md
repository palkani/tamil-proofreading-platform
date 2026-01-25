# Integration Plan: Tamil Suggestion Engine into ProofTamilRunner

## 🎯 Current State Analysis

### What You Have:
1. ✅ **Go Backend** (Gin framework)
   - Location: `backend/internal/ime/`
   - Current: Aksharamukha-based transliteration
   - Architecture: Corpus-first with fallback
   
2. ✅ **Database Infrastructure**
   - PostgreSQL with GORM
   - Tables: `tamil_words`, `tamil_phrases`, `tamil_bigrams`
   - Location: Same database as main app

3. ✅ **API Endpoint**
   - Route: `GET /api/v1/ime/suggest`
   - Handler: `backend/internal/handlers/ime_handlers.go`
   - Current params: `q`, `mode`, `limit`

### What We Built:
1. ✅ **TypeScript Service** (`services/tamil-suggest-service/`)
   - Fastify server
   - 5-factor ranking formula
   - Context boost module
   - Production-ready architecture

---

## 💡 Integration Strategy

### ✅ RECOMMENDED: Hybrid Approach (Best of Both Worlds)

**Keep both, use strategically:**

```
┌─────────────────────────────────────────┐
│     ProofTamilRunner (Main App)         │
│                                          │
│  ┌────────────────────────────────────┐ │
│  │  Go Backend (Gin)                  │ │
│  │  /api/v1/ime/suggest               │ │
│  │                                     │ │
│  │  Current: Aksharamukha fallback    │ │
│  │  NEW: Enhanced with rules          │ │
│  └────────────────────────────────────┘ │
│                                          │
│  ┌────────────────────────────────────┐ │
│  │  TypeScript Microservice           │ │
│  │  /api/suggest (Internal)           │ │
│  │                                     │ │
│  │  Advanced: 5-factor ranking        │ │
│  │  Context boost, phrase detection   │ │
│  └────────────────────────────────────┘ │
│                                          │
│         Shared PostgreSQL DB            │
└─────────────────────────────────────────┘
```

---

## 🚀 Option 1: Microservice Integration (RECOMMENDED)

**Keep TypeScript service separate, integrate via internal API**

### Pros:
- ✅ **Technology independence** - Go + TypeScript coexist
- ✅ **Easy deployment** - Deploy microservice separately
- ✅ **Faster iteration** - Update suggestion logic without main app
- ✅ **Load balancing** - Scale suggestion service independently
- ✅ **Failover** - Go backend as fallback if TS service down

### Architecture:

```go
// backend/internal/ime/service_enhanced.go

type EnhancedService struct {
    basicService    *Service              // Existing Aksharamukha
    advancedURL     string                // TS microservice URL
    useAdvanced     bool                  // Feature flag
    fallbackEnabled bool                  // Fallback to basic
}

func (s *EnhancedService) Suggest(ctx context.Context, q, mode string, limit int) ([]Candidate, map[string]interface{}) {
    // Try advanced service first
    if s.useAdvanced {
        cands, meta, err := s.callAdvancedService(ctx, q, mode, limit)
        if err == nil {
            return cands, meta
        }
        log.Printf("[IME] Advanced service failed, falling back: %v", err)
    }
    
    // Fallback to existing Aksharamukha
    return s.basicService.Suggest(ctx, q, mode, limit)
}

func (s *EnhancedService) callAdvancedService(ctx context.Context, q, mode string, limit int) ([]Candidate, map[string]interface{}, error) {
    // HTTP call to TypeScript microservice
    url := fmt.Sprintf("%s/api/suggest?q=%s&limit=%d", s.advancedURL, url.QueryEscape(q), limit)
    resp, err := http.Get(url)
    // ... parse JSON response
}
```

### Deployment:
```yaml
# docker-compose.yml
services:
  backend:
    build: ./backend
    ports:
      - "8080:8080"
    environment:
      - ADVANCED_SUGGEST_URL=http://suggest-service:8080
      - USE_ADVANCED_SUGGEST=true
    depends_on:
      - suggest-service
      - db
      
  suggest-service:
    build: ./services/tamil-suggest-service
    ports:
      - "8081:8080"
    environment:
      - DATABASE_URL=postgresql://user:pass@db:5432/tamil
    depends_on:
      - db
      
  db:
    image: postgres:16
```

### Benefits:
- **Zero disruption** to existing code
- **Gradual rollout** via feature flag
- **Independent scaling**
- **Technology flexibility**

---

## 🔄 Option 2: Port to Go (Full Integration)

**Rewrite TypeScript logic in Go, replace existing IME**

### Pros:
- ✅ **Single codebase** - No microservices
- ✅ **Simpler deployment** - One binary
- ✅ **Lower latency** - No HTTP overhead
- ✅ **Type safety** - All Go

### Cons:
- ⚠️ **Porting effort** - Rewrite 2000+ lines
- ⚠️ **Testing burden** - Validate parity
- ⚠️ **Loss of TypeScript tooling**

### Implementation:

```go
// backend/internal/ime/ranker.go
package ime

type RankInputs struct {
    PhoneticScore   float64
    Frequency       int
    BigramBoost     float64
    PhraseBonus     float64
    AcceptanceBonus float64
}

func ScoreCandidate(inputs RankInputs) float64 {
    phoneticPoints := inputs.PhoneticScore * 40
    freqPoints := math.Log1p(float64(inputs.Frequency)) * 4.3
    phrasePoints := math.Min(15, inputs.PhraseBonus)
    contextPoints := math.Min(10, inputs.BigramBoost)
    acceptancePoints := math.Min(5, inputs.AcceptanceBonus)
    
    return phoneticPoints + freqPoints + phrasePoints + contextPoints + acceptancePoints
}
```

```go
// backend/internal/ime/context_boost.go
package ime

type ContextBooster struct {
    bigramMap     map[string]map[string]int
    acceptanceMap map[string]map[string]int
}

func (cb *ContextBooster) GetBigramBoost(candidate, prevWord string) float64 {
    if prevWord == "" {
        return 0
    }
    nextWordMap, ok := cb.bigramMap[prevWord]
    if !ok {
        return 0
    }
    freq, ok := nextWordMap[candidate]
    if !ok {
        return 0
    }
    return math.Min(10, math.Log1p(float64(freq)) * 1.4)
}
```

### Effort Estimate:
- **Normalizer**: 2 hours
- **Ranker**: 3 hours
- **Context Boost**: 4 hours
- **Testing**: 4 hours
- **Documentation**: 2 hours
- **Total**: ~15 hours

---

## 🎯 Option 3: Shared Database Only

**Keep services separate, share only database**

### Architecture:

```
┌─────────────────────────────────────────┐
│  Go Backend (Gin)                       │
│  - Uses existing IME with Aksharamukha  │
│  - For basic/fast suggestions           │
└─────────────────┬───────────────────────┘
                  │
                  ▼
         ┌────────────────┐
         │  PostgreSQL    │
         │  - tamil_words │
         │  - bigrams     │
         │  - rules       │
         └────────────────┘
                  ▲
                  │
┌─────────────────┴───────────────────────┐
│  TypeScript Service (Fastify)          │
│  - For advanced/context-aware           │
│  - Direct database access               │
└─────────────────────────────────────────┘
```

### When to Use:
- Go backend: Real-time typing (speed priority)
- TS service: Advanced features (quality priority)

---

## 📊 Comparison Matrix

| Aspect | Microservice | Port to Go | Shared DB Only |
|--------|--------------|------------|----------------|
| **Deployment Complexity** | Medium | Low | Low |
| **Code Maintenance** | 2 codebases | 1 codebase | 2 codebases |
| **Development Speed** | Fast | Slow | Fast |
| **Performance** | Good (-2ms) | Excellent | Good |
| **Scalability** | Excellent | Good | Good |
| **Flexibility** | High | Medium | High |
| **Risk** | Low | Medium | Low |
| **Time to Deploy** | 2 hours | 15 hours | 1 hour |

---

## 🏆 RECOMMENDATION

### **Go with Option 1: Microservice Integration**

**Why:**
1. ✅ **Fast deployment** (2 hours vs 15 hours)
2. ✅ **Low risk** (existing code untouched)
3. ✅ **Best performance** (independent scaling)
4. ✅ **Easy rollback** (feature flag)
5. ✅ **Technology flexibility** (keep TypeScript advantages)

### Implementation Plan:

#### Phase 1: Setup Microservice (30 min)
```bash
# 1. Move service to subdirectory
mv services/tamil-suggest-service backend/services/suggest-service

# 2. Update docker-compose.yml
# Add suggest-service container

# 3. Environment variables
ADVANCED_SUGGEST_URL=http://suggest-service:8080
USE_ADVANCED_SUGGEST=false  # Start disabled
```

#### Phase 2: Add Go Client (1 hour)
```go
// backend/internal/ime/advanced_client.go
package ime

type AdvancedClient struct {
    baseURL string
    timeout time.Duration
    client  *http.Client
}

func NewAdvancedClient(baseURL string) *AdvancedClient {
    return &AdvancedClient{
        baseURL: baseURL,
        timeout: 50 * time.Millisecond,
        client:  &http.Client{Timeout: 50 * time.Millisecond},
    }
}

func (ac *AdvancedClient) Suggest(ctx context.Context, q, prev string, limit int) ([]Candidate, error) {
    url := fmt.Sprintf("%s/api/suggest?q=%s&limit=%d", 
        ac.baseURL, url.QueryEscape(q), limit)
    if prev != "" {
        url += "&prev=" + url.QueryEscape(prev)
    }
    
    req, _ := http.NewRequestWithContext(ctx, "GET", url, nil)
    resp, err := ac.client.Do(req)
    if err != nil {
        return nil, err
    }
    defer resp.Body.Close()
    
    var result struct {
        Suggestions []struct {
            Text  string  `json:"text"`
            Score float64 `json:"score"`
        } `json:"suggestions"`
    }
    
    if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
        return nil, err
    }
    
    cands := make([]Candidate, len(result.Suggestions))
    for i, s := range result.Suggestions {
        cands[i] = Candidate{
            Word:       s.Text,
            Score:      int(s.Score),
            Source:     "advanced",
            RankReason: "5-factor-formula",
        }
    }
    
    return cands, nil
}
```

#### Phase 3: Integrate with Handler (30 min)
```go
// backend/internal/handlers/ime_handlers.go

func (h *Handlers) IMESuggest(c *gin.Context) {
    // ... existing code ...
    
    // Try advanced service first if enabled
    if h.useAdvancedSuggest && h.advancedClient != nil {
        cands, err := h.advancedClient.Suggest(ctx, q, prev, limit)
        if err == nil && len(cands) > 0 {
            // Success! Return advanced suggestions
            suggestions := formatCandidates(cands)
            c.JSON(http.StatusOK, gin.H{
                "success": true,
                "suggestions": suggestions,
                "meta": gin.H{
                    "engine": "advanced",
                    "source": "5-factor-formula",
                },
            })
            return
        }
        log.Printf("[IME] Advanced service failed, falling back: %v", err)
    }
    
    // Fallback to existing Aksharamukha
    cands, meta := h.imeSvc.Suggest(ctx, q, mode, limit)
    // ... existing response code ...
}
```

#### Phase 4: Testing (30 min)
```bash
# Start services
docker-compose up -d

# Test basic (existing)
curl "http://localhost:8080/api/v1/ime/suggest?q=vanakkam"

# Enable advanced
# Set USE_ADVANCED_SUGGEST=true

# Test advanced
curl "http://localhost:8080/api/v1/ime/suggest?q=vanakkam&prev=வணக்கம்"

# Verify fallback (stop suggest-service)
docker-compose stop suggest-service
curl "http://localhost:8080/api/v1/ime/suggest?q=vanakkam"
# Should still work via fallback
```

---

## 📁 Final Project Structure

```
tamil-proofreading-platform/
├── backend/                          # Go main app
│   ├── internal/
│   │   ├── ime/
│   │   │   ├── service.go           # Existing (Aksharamukha)
│   │   │   ├── advanced_client.go   # NEW: HTTP client to TS service
│   │   │   └── corpus.go            # Existing
│   │   └── handlers/
│   │       └── ime_handlers.go      # Enhanced with advanced call
│   └── services/                     # NEW FOLDER
│       └── suggest-service/          # Moved from root
│           ├── src/
│           │   ├── suggest/
│           │   └── db/
│           ├── Dockerfile
│           └── README.md
├── express-frontend/
├── docker-compose.yml                # Updated with suggest-service
└── README.md                         # Updated architecture
```

---

## 🎯 Migration Checklist

### Pre-Migration:
- [ ] Backup existing database
- [ ] Document current API contract
- [ ] Test existing IME functionality

### Migration Steps:
- [ ] Move TypeScript service to `backend/services/suggest-service/`
- [ ] Update docker-compose.yml
- [ ] Add Go HTTP client (`advanced_client.go`)
- [ ] Enhance IME handler with advanced call + fallback
- [ ] Add feature flag `USE_ADVANCED_SUGGEST`
- [ ] Deploy to staging
- [ ] Run parallel testing (basic vs advanced)
- [ ] Monitor metrics

### Post-Migration:
- [ ] A/B test basic vs advanced
- [ ] Collect user feedback
- [ ] Tune ranking weights
- [ ] Gradually increase advanced traffic
- [ ] Full cutover when stable

---

## 💰 Cost-Benefit Analysis

### Microservice Approach:
| Aspect | Value |
|--------|-------|
| **Development Time** | 2 hours |
| **Risk** | Low |
| **Deployment Cost** | +1 container |
| **Maintenance** | 2 codebases |
| **Performance** | <30ms |
| **Flexibility** | High |

### Port to Go:
| Aspect | Value |
|--------|-------|
| **Development Time** | 15 hours |
| **Risk** | Medium |
| **Deployment Cost** | Same |
| **Maintenance** | 1 codebase |
| **Performance** | <25ms |
| **Flexibility** | Medium |

---

## 🚀 Quick Start Commands

```bash
# 1. Move service
cd /Users/palkanirajendran/Documents/Palkani/SAAS_IDEAS/tamil-proofreading-platform
mkdir -p backend/services
mv services/tamil-suggest-service backend/services/suggest-service

# 2. Update docker-compose
cat >> docker-compose.yml << 'EOF'
  suggest-service:
    build: ./backend/services/suggest-service
    ports:
      - "8081:8080"
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - PORT=8080
    depends_on:
      - db
EOF

# 3. Add Go client
# Create backend/internal/ime/advanced_client.go
# (See code above)

# 4. Test
docker-compose up -d
curl "http://localhost:8080/api/v1/ime/suggest?q=vanakkam"
```

---

## 🎉 Conclusion

**Recommended: Microservice Integration (Option 1)**

**Advantages:**
- ✅ Fast (2 hours)
- ✅ Low risk
- ✅ Keeps TypeScript benefits
- ✅ Easy rollback
- ✅ Independent scaling

**Next Steps:**
1. Move TS service to `backend/services/suggest-service/`
2. Add Go HTTP client
3. Update handler with fallback logic
4. Deploy with feature flag OFF
5. Test thoroughly
6. Enable gradually

**Estimated Timeline:**
- Setup: 30 min
- Go client: 1 hour
- Integration: 30 min
- Testing: 30 min
- **Total: 2.5 hours**

Ready to proceed? Let me know and I'll help with the implementation!

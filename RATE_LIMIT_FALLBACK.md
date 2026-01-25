# Rate Limit Protection & Fallback System

## 🚨 Error You're Seeing

```
"code": 429,
"message": "You exceeded your current quota, please check your plan and billing details."
"status": "RESOURCE_EXHAUSTED"
```

**What this means:**
- Gemini API free tier: **20 requests/minute**
- You hit this limit
- Requests are now failing

---

## ✅ Good News: Fallback System Exists!

Your backend has **automatic fallback** logic:

### Fallback Chain

```
1. Gemini API (Primary)
        ↓ (if 429/503/5xx)
2. OpenAI GPT-4 (Fallback #1)
        ↓ (if fails)
3. Anthropic Claude (Fallback #2)
        ↓ (if fails)
4. Return error to user
```

---

## 🔍 Current Status

### Fallback Code: ✅ Exists

**File:** `backend/internal/services/llm/llm_service.go`

```go
if shouldFallbackOn(err) {
    if s.openAIClient != nil {
        log.Printf("[FALLBACK-OPENAI] Using OpenAI because Gemini failed")
        if out, ferr := s.proofreadWithOpenAI(ctx, cleaned, requestID); ferr == nil {
            return out, nil
        }
    }
    if strings.TrimSpace(s.anthropicKey) != "" {
        log.Printf("[FALLBACK-ANTHROPIC] Using Anthropic because Gemini failed")
        if out, ferr := s.proofreadWithAnthropic(ctx, cleaned, requestID); ferr == nil {
            return out, nil
        }
    }
}
```

### Triggers: ✅ Includes 429

```go
func shouldFallbackOn(err error) bool {
    var pe *ProviderError
    if errors.As(err, &pe) {
        if pe.StatusCode == 429 || pe.StatusCode == 408 {
            return true  // Rate limit or timeout
        }
        if pe.StatusCode >= 500 && pe.StatusCode <= 599 {
            return true  // Server errors
        }
    }
    return false
}
```

### Configuration: ❌ Missing

**Problem:**
- `OPENAI_API_KEY` environment variable **NOT SET**
- `ANTHROPIC_API_KEY` environment variable **NOT SET**

**Result:**
- Fallback code runs but has no API keys
- Requests fail instead of falling back

---

## 🔧 Solution: Configure OpenAI Fallback

### Quick Setup

**Run in Google Cloud Shell:**

```bash
# Get OpenAI API key from: https://platform.openai.com/api-keys
./configure_openai_fallback.sh YOUR_OPENAI_API_KEY
```

This will:
1. ✅ Store key in Secret Manager
2. ✅ Update backend service environment
3. ✅ Enable automatic fallback

---

## 📊 Rate Limits Comparison

| Provider | Free Tier | Paid Tier | Cost |
|----------|-----------|-----------|------|
| **Gemini** | 20 req/min | 1000 req/min | $0.00015/1K chars |
| **OpenAI** | N/A | 10,000 req/min | $0.0015/1K chars (10x more) |
| **Anthropic** | N/A | 4,000 req/min | $0.0003/1K chars (2x more) |

**Recommendation:** Configure OpenAI as fallback for critical uptime

---

## 🎯 Architecture

### With Fallback (Recommended) ✅

```
User Request
    ↓
┌─────────────────────────────┐
│ Try Gemini (Primary)        │
│ - Fast                      │
│ - Free tier: 20 req/min     │
│ - Cost: $0.00015/1K chars   │
└─────────────────────────────┘
    ↓ (429 error)
┌─────────────────────────────┐
│ Fallback to OpenAI          │
│ - Reliable                  │
│ - 10K req/min               │
│ - Cost: $0.0015/1K chars    │
└─────────────────────────────┘
    ↓ (error)
┌─────────────────────────────┐
│ Fallback to Anthropic       │
│ - Ultra-reliable            │
│ - 4K req/min                │
│ - Cost: $0.0003/1K chars    │
└─────────────────────────────┘
```

**Result:** 99.9%+ uptime!

---

### Without Fallback (Current) ❌

```
User Request
    ↓
┌─────────────────────────────┐
│ Try Gemini                  │
└─────────────────────────────┘
    ↓ (429 error)
❌ Request fails
❌ User sees error
```

**Result:** Poor user experience during rate limits

---

## 🚀 Setup Instructions

### Option 1: OpenAI Only (Recommended)

**Cost:** ~$1-5/month for moderate usage

```bash
# 1. Get OpenAI API key
# Visit: https://platform.openai.com/api-keys

# 2. Run setup script
./configure_openai_fallback.sh sk-proj-...YOUR_KEY...

# 3. Test
curl -X POST https://backend-service-XXXX.run.app/api/submit \
  -H "Content-Type: application/json" \
  -d '{"text": "Test Tamil text வணக்கம்"}'
```

---

### Option 2: OpenAI + Anthropic (Maximum Reliability)

**Cost:** ~$2-10/month

```bash
# 1. Get both API keys
# OpenAI: https://platform.openai.com/api-keys
# Anthropic: https://console.anthropic.com/

# 2. Configure OpenAI
./configure_openai_fallback.sh YOUR_OPENAI_KEY

# 3. Configure Anthropic
echo "YOUR_ANTHROPIC_KEY" | gcloud secrets create ANTHROPIC_API_KEY \
  --data-file=- \
  --project=tamil-proofreading-saas

gcloud run services update backend-service \
  --region=asia-south1 \
  --update-env-vars="ANTHROPIC_API_KEY=$(gcloud secrets versions access latest --secret=ANTHROPIC_API_KEY)" \
  --quiet
```

---

### Option 3: Increase Gemini Quota (No Fallback Needed)

**Cost:** Pay-as-you-go, ~$0.15/1M chars

```bash
# 1. Enable billing for Gemini
# Visit: https://ai.google.dev/pricing

# 2. Your rate limits automatically increase:
#    - Free: 20 req/min
#    - Paid: 1000 req/min

# No code changes needed!
```

---

## 🧪 Testing Fallback

### Trigger Rate Limit

```bash
# Send 21 requests quickly
for i in {1..25}; do
  curl -X POST https://backend-service-XXXX.run.app/api/submit \
    -H "Content-Type: application/json" \
    -d "{\"text\": \"Test $i\"}" &
done
wait

# Check logs
gcloud run services logs read backend-service --region=asia-south1 --limit=50
```

### Expected Logs

**With fallback configured:**
```
[GEMINI] error: 429 rate limit
[FALLBACK-OPENAI] Using OpenAI because Gemini failed
[OPENAI] SUCCESS - Total time: 2.3s
```

**Without fallback:**
```
[GEMINI] error: 429 rate limit
❌ Error: rate limit exceeded
```

---

## 📈 Monitoring

### Check Current Usage

```bash
# Gemini usage
# Visit: https://ai.dev/rate-limit

# OpenAI usage
# Visit: https://platform.openai.com/usage

# Anthropic usage
# Visit: https://console.anthropic.com/settings/usage
```

### Backend Logs

```bash
# Real-time logs
gcloud run services logs tail backend-service --region=asia-south1

# Search for fallbacks
gcloud run services logs read backend-service \
  --region=asia-south1 \
  --format="value(textPayload)" \
  | grep FALLBACK
```

---

## 💡 Recommendations

### For Development/Testing
- ✅ Use Gemini free tier (20 req/min)
- ✅ No fallback needed
- ✅ Cost: $0

### For Production (Low Traffic)
- ✅ Use Gemini free tier
- ✅ Configure OpenAI fallback
- ✅ Cost: ~$1-3/month

### For Production (High Traffic)
- ✅ Upgrade to Gemini paid tier (1000 req/min)
- ✅ Configure OpenAI + Anthropic fallback
- ✅ Cost: ~$5-20/month depending on usage

---

## 🔍 Troubleshooting

### Fallback Not Working?

**Check 1:** Is OpenAI key configured?
```bash
gcloud run services describe backend-service \
  --region=asia-south1 \
  --format="value(spec.template.spec.containers[0].env)" | grep OPENAI
```

**Check 2:** Are logs showing fallback attempt?
```bash
gcloud run services logs read backend-service \
  --region=asia-south1 | grep FALLBACK
```

**Check 3:** Is OpenAI key valid?
```bash
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer YOUR_KEY"
```

---

### Still Getting 429 Errors?

**Possible causes:**
1. ❌ OpenAI key not configured → Run setup script
2. ❌ OpenAI also rate limited → Add Anthropic fallback
3. ❌ Both fallbacks exhausted → Upgrade to paid tiers

---

## 📚 Related Files

- `backend/internal/services/llm/llm_service.go` - Fallback logic
- `backend/internal/services/llm/openai.go` - OpenAI integration
- `backend/internal/services/llm/anthropic.go` - Anthropic integration
- `configure_openai_fallback.sh` - Setup script

---

## 🎉 Summary

**Problem:** Gemini 429 rate limit (20 req/min)

**Solution Options:**
1. ✅ **Configure OpenAI fallback** (recommended for uptime)
2. ✅ **Upgrade Gemini to paid** (recommended for cost)
3. ✅ **Both** (recommended for production)

**Setup:**
```bash
./configure_openai_fallback.sh YOUR_OPENAI_KEY
```

**Result:** 99.9%+ uptime even during rate limits! 🚀

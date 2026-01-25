# Debugging OpenAI Fallback - Quick Guide

## 🎯 You Said: "I have OPENAI_API_KEY in backend cloud run"

Let's verify why the fallback isn't working!

---

## ✅ Step 1: Deploy Latest Code (2 minutes)

The latest code adds detailed logging to diagnose the issue.

**Wait for deployment to complete:**
```bash
# Check deployment status
gcloud run services list --region=asia-south1 --project=tamil-proofreading-saas
```

Wait until `backend-service` shows as "Ready" (~2-3 minutes).

---

## 🔍 Step 2: Check Startup Logs

**Run this command:**
```bash
gcloud run services logs read backend-service \
  --region=asia-south1 \
  --project=tamil-proofreading-saas \
  --limit=200 \
  | grep "CONFIG"
```

### What to look for:

#### ✅ GOOD - OpenAI configured:
```
[CONFIG] Gemini API key found: AIzaSy***xxxx (length: 39)
[CONFIG] OpenAI API key found: sk-proj***xxxx (length: 51) - fallback enabled
```

#### ❌ BAD - OpenAI missing:
```
[CONFIG] Gemini API key found: AIzaSy***xxxx (length: 39)
[CONFIG] WARNING: OpenAI API key is empty - no fallback available for rate limits
```

---

## 🧪 Step 3: Trigger Rate Limit & Check Fallback

**Make 21+ requests to trigger rate limit:**
```bash
# Get your backend URL
BACKEND_URL=$(gcloud run services describe backend-service \
  --region=asia-south1 \
  --project=tamil-proofreading-saas \
  --format='value(status.url)')

# Send 25 requests (will hit 20/min limit)
for i in {1..25}; do
  echo "Request $i..."
  curl -s -X POST "$BACKEND_URL/api/submit" \
    -H "Content-Type: application/json" \
    -d "{\"text\": \"Test $i வணக்கம்\"}" &
done
wait
```

---

## 📊 Step 4: Check Fallback Logs

**Run this command:**
```bash
gcloud run services logs read backend-service \
  --region=asia-south1 \
  --project=tamil-proofreading-saas \
  --limit=100 \
  | grep -E "FALLBACK|429"
```

### Scenario A: ✅ Fallback Working

```
gemini proofread error: 429 rate limit exceeded
[FALLBACK-CHECK] shouldFallback=true hasOpenAI=true hasAnthropic=false
[FALLBACK-OPENAI] Using OpenAI because Gemini failed
[OPENAI] SUCCESS - Total time: 2.3s
```

**Meaning:** Everything is working! OpenAI kicked in automatically.

---

### Scenario B: ❌ OpenAI Key Not Loaded

```
gemini proofread error: 429 rate limit exceeded
[FALLBACK-CHECK] shouldFallback=true hasOpenAI=false hasAnthropic=false
[FALLBACK-SKIP] OpenAI client is nil
```

**Meaning:** `OPENAI_API_KEY` environment variable is not set or empty.

**Fix:**
```bash
# Check if env var exists
gcloud run services describe backend-service \
  --region=asia-south1 \
  --format="value(spec.template.spec.containers[0].env)"

# If not present, add it:
gcloud run services update backend-service \
  --region=asia-south1 \
  --update-env-vars="OPENAI_API_KEY=YOUR_KEY_HERE" \
  --quiet
```

---

### Scenario C: ❌ Fallback Not Triggered

```
gemini proofread error: 429 rate limit exceeded
[FALLBACK-CHECK] shouldFallback=false hasOpenAI=true hasAnthropic=false
```

**Meaning:** The error type isn't being recognized as retryable.

**Fix:** Check error format - might need to update `shouldFallbackOn()` function.

---

### Scenario D: ❌ OpenAI Also Fails

```
[FALLBACK-OPENAI] Using OpenAI because Gemini failed
[FALLBACK-OPENAI-ERROR]: OpenAI error: invalid API key
```

**Meaning:** OpenAI key is configured but invalid.

**Fix:**
```bash
# Test OpenAI key directly
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer YOUR_KEY"

# If invalid, get new key from: https://platform.openai.com/api-keys
# Then update:
gcloud run services update backend-service \
  --region=asia-south1 \
  --update-env-vars="OPENAI_API_KEY=NEW_KEY" \
  --quiet
```

---

## 🎯 Quick Diagnostic Commands

### Check OpenAI Env Var
```bash
gcloud run services describe backend-service \
  --region=asia-south1 \
  --format="yaml" \
  | grep -A 2 "OPENAI"
```

### See All Startup Logs
```bash
gcloud run services logs read backend-service \
  --region=asia-south1 \
  --limit=50 \
  | grep "\[CONFIG\]"
```

### Monitor Real-Time
```bash
gcloud run services logs tail backend-service --region=asia-south1
```

### Check Recent Errors
```bash
gcloud run services logs read backend-service \
  --region=asia-south1 \
  --limit=100 \
  | grep -i "error\|fallback"
```

---

## 📝 What The Logs Mean

| Log Message | Meaning | Action |
|-------------|---------|--------|
| `OpenAI API key found: sk-proj***` | ✅ OpenAI configured | None needed |
| `WARNING: OpenAI API key is empty` | ❌ Not configured | Set env var |
| `hasOpenAI=true` | ✅ Client initialized | Good! |
| `hasOpenAI=false` | ❌ Client is nil | Key missing |
| `[FALLBACK-OPENAI] Using OpenAI` | ✅ Fallback triggered | Working! |
| `[FALLBACK-SKIP] OpenAI client is nil` | ❌ Can't fallback | Add key |

---

## 🚀 Most Likely Issues

### Issue 1: Env Var Not Set
**Symptom:** `hasOpenAI=false`

**Fix:**
```bash
gcloud run services update backend-service \
  --region=asia-south1 \
  --update-env-vars="OPENAI_API_KEY=sk-proj-YOUR_KEY" \
  --quiet
```

### Issue 2: Old Deployment
**Symptom:** No `[FALLBACK-CHECK]` logs

**Fix:** Wait for deployment to complete (2-3 min)

### Issue 3: Wrong Key Format
**Symptom:** `[FALLBACK-OPENAI-ERROR]: invalid API key`

**Fix:** Get new key from https://platform.openai.com/api-keys

---

## ✅ Expected Flow (After Fix)

```
1. Request comes in
     ↓
2. Try Gemini
     ↓
3. Gemini returns 429
     ↓
4. [FALLBACK-CHECK] shouldFallback=true hasOpenAI=true
     ↓
5. [FALLBACK-OPENAI] Using OpenAI because Gemini failed
     ↓
6. [OPENAI] SUCCESS - Total time: 2.3s
     ↓
7. Return result to user ✅
```

---

## 📞 Report Back

After running the diagnostic commands, share:

1. **Startup logs** (Step 2 output)
2. **Fallback logs** (Step 4 output)
3. **Env var check** (Quick diagnostic output)

This will tell us exactly what's happening!

---

## 🎉 Quick Summary

**Now:** Detailed logging added  
**Next:** Run diagnostic commands above  
**Result:** We'll see exactly why fallback isn't working  

The code deployment is happening now (~2-3 min). After that, run the commands above! 🚀

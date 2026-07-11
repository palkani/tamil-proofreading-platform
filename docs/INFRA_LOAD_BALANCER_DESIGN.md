# Backend Routing & Load Balancer — Design Proposal

**Status:** Draft · **Author:** Backend audit · **Date:** 2026-07-11

Replace ad-hoc multi-URL routing with a **single global HTTPS Load Balancer** in front of both Cloud Run regions. Result: one URL, automatic failover, tighter security surface, drops ~500 lines of frontend region-picking code.

---

## 1. Current architecture (what we have)

```
    Browser (any region)
        │
        ├────────────► www.prooftamil.com  ─── Vercel (Express/EJS)
        │                                        │
        │                                        ├─ /api/v1/* rewrite ──► asia-south1 Cloud Run  [1]
        │                                        ├─ /api/v1/suggest ────► edge fn (own routing)  [2]
        │                                        ├─ Express routes  ────► req._backendUrl based on
        │                                        │                        Vercel geo header       [3]
        │                                        └─ /admin/api/*    ────► ADMIN_BACKEND_URL       [4]
        │
        └────────────► direct fetch: never (all client fetches are same-origin)
```

**Problems:**
- Four independent routing decisions (`[1]`, `[2]`, `[3]`, `[4]`) that disagree with each other
- `vercel.json` rewrite `[1]` catches everything before Express geo-routing `[3]` can run — the geo router is effectively dead for the `/api/v1/*` prefix
- Zero cross-region failover: if Asia is down, all `[1]` traffic 502s
- CORS is `AllowOrigins: ["*"]` because we have multiple backend hosts
- Multiple retry loops (`routes/api.js:114`, `routes/index.js:59`, `api/v1/suggest.js:57`, `routes/api.js:1526`) all retry the same URL — no cross-region recovery
- Stale Cloud Run URLs hardcoded in EJS (`prooftamil-runner-*` — retired service)
- Dead fallback to `api.prooftamil.com` in 4 files, but DNS not configured
- Backend URL sprawl: 6 env vars, hardcoded in 12+ files

---

## 2. Proposed architecture

```
   Browser (any region)
        │
        ├──► www.prooftamil.com (Vercel — EJS + Express, unchanged)
        │
        └──► api.prooftamil.com ──► GCP Global HTTPS Load Balancer (anycast IP)
                                        │
                                        ├─ Cloud Armor (DDoS + rate limit + geo rules)
                                        ├─ Cloud CDN (caches GET /blog/posts, /suggest)
                                        └─ URL Map → Backend Service (health-checked)
                                                          │
                                                          ├──► Serverless NEG ──► Cloud Run (asia-south1)
                                                          └──► Serverless NEG ──► Cloud Run (us-central1)
```

**Every browser request goes to a SINGLE hostname.** GCP's anycast network routes the packet to the geographically-nearest Google edge, which then reaches the healthy nearest region. Zero region-picking code needed on the frontend.

### 2.1 Components

| Component | Purpose |
|---|---|
| **Global forwarding rule** | Anycast IPv4 (+optional IPv6). Announces the same IP from every Google POP. |
| **HTTPS proxy** | Terminates TLS with a Google-managed SSL cert (auto-renews). |
| **URL map** | Routes paths to backend services. One backend for everything, or split (e.g. `/blog/*` to a CDN-friendly service, `/api/*` to a bypass-cache service). |
| **Backend service** | Contains the two Serverless NEGs. Configures health check, timeout, session affinity, CDN. |
| **Serverless NEG** (× 2) | Wraps a single Cloud Run service. One NEG per region. |
| **Cloud CDN** (optional, high win) | Caches GET responses that opt in via `Cache-Control`. Blog posts, static suggestions, sitemaps — big cost + latency win. |
| **Cloud Armor** (optional, cheap) | WAF-lite: rate limit `/api/submit` per IP, geo-block obvious abuse, bot mitigation. |

### 2.2 Failover behavior

- Health check hits `GET /health` on each NEG every 10s
- Region considered unhealthy after **3 consecutive failures** (~30s)
- Traffic drains to the healthy region within ~1 pass
- Cold-start 503 wrapper (`{"status":"starting"}`) counts as unhealthy → prevents routing to a booting instance mid-deploy
- Recovers automatically when health check flips back to 200

### 2.3 Latency wins

| Route | Today | With GLB + CDN |
|---|---|---|
| Chennai user → `/api/v1/submit` | ~180 ms (Vercel → Iowa if geo-router picks US) | ~40 ms (POP in Mumbai → Cloud Run Mumbai) |
| NYC user → `GET /blog/tholkappiyam-introduction` | ~350 ms (backend cold-start possible) | ~15 ms (CDN edge in NYC) |
| London user → `/api/v1/suggest` | ~250 ms (via Vercel edge fn → US) | ~90 ms (POP in London → CDN → Iowa) |
| Any user, Asia down | 502 (100% of Asia traffic) | Automatic failover to US in ~30s |

---

## 3. Migration plan

**Phase 0 — DNS + cert prep (no user-visible change)**
1. Create GCP static anycast IP (reserved, free while used)
2. Create Google-managed SSL cert for `api.prooftamil.com`
3. Add DNS A record `api.prooftamil.com → <anycast IP>` (TTL 300 during rollout)
4. Wait for cert issuance (~15 min after DNS propagates)

**Phase 1 — LB setup (parallel to existing traffic)**
5. Create serverless NEG for `prooftamil-backend` (asia-south1)
6. Create serverless NEG for `prooftamil-backend-us` (us-central1)
7. Create backend service `bs-prooftamil` with both NEGs + `/health` check
8. Create URL map, HTTPS proxy, forwarding rule
9. **Verify** `https://api.prooftamil.com/health` returns 200 from every region

**Phase 2 — Frontend cutover (feature-flagged)**
10. Add Vercel env `BACKEND_URL_UNIFIED=https://api.prooftamil.com`
11. In `utils/regional-backend.js`, when `BACKEND_URL_UNIFIED` is set, return it unconditionally (drops all geo logic)
12. Update `vercel.json` — change `/api/v1/*` rewrite target from Asia URL to `api.prooftamil.com`
13. Delete `api/v1/suggest.js` edge function (no longer needed)
14. Update `views/pages/*.ejs` — remove `TRANSLITERATOR_URLS` dead code

**Phase 3 — Cleanup (delete-only PR)**
15. Delete env vars: `BACKEND_URL_ASIA`, `BACKEND_URL_US`, `BACKEND_URL_PRIMARY`, `ADMIN_BACKEND_URL`
16. Delete `.github/workflows/deploy.yml` lines that set those vars via Vercel CLI
17. Tighten backend CORS: `AllowOrigins: ["https://www.prooftamil.com", "https://prooftamil.com"]`
18. Delete the four retry loops in favor of one shared helper (GLB failover means retries only need to handle transient blips, not region outages)

**Phase 4 — Optimization (optional, incremental)**
19. Enable Cloud CDN on the backend service; add `Cache-Control: public, max-age=300` to `/api/v1/blog/posts*`
20. Enable Cloud Armor: rate-limit `/api/submit` at 30 req/min per IP, block known bad ASNs
21. Enable HTTP/3 (single toggle on HTTPS proxy)

---

## 4. `gcloud` commands (Phase 1)

Run once, from anywhere with `gcloud` authenticated to project `prooftamil`.

```bash
# Reserve anycast IPv4
gcloud compute addresses create prooftamil-lb-ip \
  --global \
  --ip-version=IPV4

# Get the reserved IP for the DNS step (do this BEFORE creating LB)
gcloud compute addresses describe prooftamil-lb-ip --global --format='value(address)'

# Google-managed SSL cert (needs DNS to point to the LB IP before it will issue)
gcloud compute ssl-certificates create prooftamil-api-cert \
  --domains=api.prooftamil.com \
  --global

# Serverless NEG: Asia
gcloud compute network-endpoint-groups create neg-prooftamil-asia \
  --region=asia-south1 \
  --network-endpoint-type=serverless \
  --cloud-run-service=prooftamil-backend

# Serverless NEG: US
gcloud compute network-endpoint-groups create neg-prooftamil-us \
  --region=us-central1 \
  --network-endpoint-type=serverless \
  --cloud-run-service=prooftamil-backend-us

# Backend service — the load-balancing target
gcloud compute backend-services create bs-prooftamil \
  --global \
  --load-balancing-scheme=EXTERNAL_MANAGED \
  --protocol=HTTPS \
  --timeout=60s

# Attach both regional NEGs (LB auto-routes to closest healthy)
gcloud compute backend-services add-backend bs-prooftamil \
  --global \
  --network-endpoint-group=neg-prooftamil-asia \
  --network-endpoint-group-region=asia-south1

gcloud compute backend-services add-backend bs-prooftamil \
  --global \
  --network-endpoint-group=neg-prooftamil-us \
  --network-endpoint-group-region=us-central1

# URL map: send everything to the backend service
gcloud compute url-maps create um-prooftamil \
  --default-service=bs-prooftamil

# HTTPS proxy binds URL map to SSL cert
gcloud compute target-https-proxies create hp-prooftamil \
  --url-map=um-prooftamil \
  --ssl-certificates=prooftamil-api-cert

# Global forwarding rule = the anycast IP → HTTPS proxy
gcloud compute forwarding-rules create fr-prooftamil \
  --global \
  --address=prooftamil-lb-ip \
  --target-https-proxy=hp-prooftamil \
  --ports=443

# Verify
curl https://api.prooftamil.com/health
# Expected: {"status":"healthy","service":"tamil-proofreading-backend","time":"..."}
```

The whole Phase 1 typically takes 20-30 minutes end-to-end, most of it waiting for the SSL cert to provision.

---

## 5. Trade-offs considered

### GCP Global LB (chosen)
| Pro | Con |
|---|---|
| Native to GCP — same-network egress from LB to Cloud Run is free | ~$18/mo baseline cost |
| Anycast IP + Google's private backbone for lowest latency | GCP-only lock-in |
| Zero-config failover between regions | Requires proper `/health` (already exists) |
| Cloud CDN + Armor add-ons drop in cleanly | |
| Google-managed SSL, auto-renewing | |
| Single origin cleans up CORS | |

### Alternative: Cloudflare in front of Cloud Run
| Pro | Con |
|---|---|
| Larger POP network (300+) than Google (~30 premium tier) | Cloud Run → Cloudflare egress becomes billable (~$0.12/GB vs free for GCP-internal) |
| Free tier is generous | Two-vendor complexity (config in both dashboards) |
| Best-in-class DDoS + bot protection on free plan | No native Cloud Run health check integration; Cloudflare doesn't know when to fail over |
| Cloudflare Workers can add custom logic | Extra hop adds ~10-30ms |

**Decision:** For an API talking to Cloud Run backends, GCP-native is faster AND cheaper (egress). Cloudflare would win for a static-heavy site.

### Alternative: Do nothing / status quo
| Pro | Con |
|---|---|
| Zero new infra to manage | Every point in §1 remains a live bug or attack surface |
| $0 additional cost | No failover — Asia region down = downtime for Asia users |
| | CORS is still `["*"]` — can't tighten |
| | Multiple region-decision layers keep drifting |

**Decision:** Status quo is unacceptable at any real user scale. The load balancer is table-stakes for anything past MVP.

---

## 6. Cost estimate

| Line item | Monthly cost |
|---|---|
| Global forwarding rule | ~$18 |
| Serverless NEG × 2 | $0 (free) |
| Managed SSL cert | $0 (free) |
| Anycast IP (while attached) | $0 |
| Cloud CDN (assume 50 GB/mo cached egress) | ~$1 |
| Cloud Armor (basic policy) | ~$5 |
| **Total incremental** | **~$25/mo** |

For context: current Cloud Run costs are probably $20-40/mo. Adding $25 for a proper LB + CDN + WAF is roughly a 60-100% infra increase but delivers a large functionality + reliability upgrade.

---

## 7. Rollback plan

Every phase is independently reversible.

- **Phase 1** (LB set up but no traffic): delete forwarding rule + proxy + backend service. Zero user impact.
- **Phase 2** (traffic cut over): flip `BACKEND_URL_UNIFIED` env var back to unset. Vercel rewrite reverts to Asia URL. Two-minute rollback.
- **Phase 3** (env vars deleted): re-add via Vercel CLI. Requires a redeploy.

Recommended: keep Phase 2 in production for a week before doing Phase 3. Watch Cloud Monitoring for the backend service — verify traffic is split roughly by geo and that no region is silently 5xx'ing.

---

## 8. What this does NOT solve

- **Backend cold starts** — GLB routes around a cold-starting region only when `/health` fails during startup (which it does via the `{status:starting}` wrapper — good). But if BOTH regions cold-start simultaneously (e.g. no traffic for hours + scale-to-zero), users still see the cold-start delay. **Answer: `min-instances=1` on both regions (already set per commit `f412be4`).**
- **Vercel cold starts** — the Express layer on Vercel also cold-starts. Independent problem, out of scope here.
- **Supabase pooler blips** — the DB layer is unchanged; transient pgBouncer issues still surface. Recent retry logic in `submission_handlers.go` mitigates.

---

## 9. Follow-up doc

Once Phase 1 is live, write a runbook: how to debug a region-down event (which log-based metric to alert on, how to force-drain a region, etc.). That document lives at `docs/INFRA_RUNBOOK.md` when written.

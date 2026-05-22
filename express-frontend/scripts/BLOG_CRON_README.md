# Scheduled blog generator (Stage 1: foundation)

A small system that generates SEO-optimized blog drafts from a curated topic queue. Drafts are posted with `status: draft` so a human reviews them in the admin UI before publishing — no surprise content goes live.

## Files

| Path | Role |
|---|---|
| [`data/blog-queue.yaml`](../../data/blog-queue.yaml) | Hand-curated topic queue (you edit this) |
| `data/blog-queue-state.json` | Auto-generated state (don't hand-edit; tracks which topics have been generated) |
| `express-frontend/scripts/generate-scheduled-blog.js` | The generator script |
| `express-frontend/scripts/lib/seo-quality-gate.js` | Validation logic — word count, keyword density, internal links, AI-cliché detection |

## How to use

### 1. Get an admin JWT token

In a logged-in browser session as an admin:
```
DevTools → Application → Cookies → access_token → copy the value
```

### 2. Run the generator

**Dry run** (no posting, just generate + validate):
```bash
ADMIN_TOKEN=<your-jwt> node express-frontend/scripts/generate-scheduled-blog.js --dry-run
```

**Real run** (creates a draft):
```bash
ADMIN_TOKEN=<your-jwt> node express-frontend/scripts/generate-scheduled-blog.js
```

The script will:
1. Pick the first topic in `blog-queue.yaml` whose `status: queued` and which hasn't already been generated (per `blog-queue-state.json`).
2. Call the AI Content Writer at `/api/v1/ai-content-writer/generate-content`.
3. Run the SEO quality gate. If it fails, the script exits with code 1 and posts nothing.
4. POST to `/api/blog/publish` with `status: "draft"`.
5. Append a state entry recording the topic + draft ID + timestamp.
6. Print the review URL (`/my-blogs`).

### 3. Review the draft

Open `/my-blogs`. Find the new draft. Read it, edit anything that feels off (especially: add 2-3 paragraphs in your own voice — that's the human-in-loop part of Option B). Click **Publish** when you're satisfied.

## Pausing / resuming generation

The queue file has a top-level `paused:` flag. When `paused: true`, the
generator exits immediately without producing anything — even if run
manually or by a future cron. This is the safe way to halt generation
without deleting the queue.

**Currently PAUSED** (since 2026-05-17) while Google's indexation catches
up — generating more content while the existing backlog sits in
"Discovered - not indexed" dilutes crawl signals.

**To resume:**
1. Edit `data/blog-queue.yaml`, change `paused: true` → `paused: false`
2. Run the generator normally — it continues from the next `status: queued` topic

**One-off generation while paused** (for testing, doesn't change the flag):
```bash
ADMIN_TOKEN=<jwt> node express-frontend/scripts/generate-scheduled-blog.js --ignore-pause
```

**When to resume:** indexed-count ≈ 60-70% of total sitemap URLs, OR after
2-3 quality backlinks have landed (whichever comes first). Check Search
Console → Pages before resuming.

## Adding new topics

Append to the `queue:` list in `data/blog-queue.yaml`:

```yaml
- topic: "Your topic title — descriptive enough that the AI can write 1500 words"
  keyword: "your primary keyword"   # Must appear in title + body
  language: english                  # or "tamil"
  tier: 1                            # 1=commercial, 2=Tholkappiyam, 3=tutorial
  min_words: 1500
  suggested_internal_links:
    - existing-blog-slug-1
    - existing-blog-slug-2
  status: queued
```

Topic order matters — the script picks top-to-bottom. Interleave commercial-intent (Tier 1) with topical-authority (Tier 2) to keep the cadence balanced.

## Quality gate thresholds

The gate fails (no draft posted) on:
- Title missing primary keyword
- Word count below `min_words`
- Fewer than 4 H2 headings
- Fewer than 2 internal links
- Primary keyword absent from body
- 3+ AI-cliché phrases ("in today's world", "delve into", "unlock the potential", etc.)

The gate warns (draft still posted, but the report flags it) on:
- Title length outside 30-70 chars
- Meta description outside 100-170 chars
- Keyword frequency outside 2-15× (or > wordCount/60)
- Suggested internal links not used
- Repetitive transitions (5+ "Furthermore,/Moreover,/Additionally,")

Refine `lib/seo-quality-gate.js` if you want different thresholds.

## Re-generating a poor-quality post

If an existing post is weak (low H2 count, short meta, corrupted Tamil, etc.) and you want the generator to replace it:

### 1. Identify which post(s) to replace

Quick audit script: paste a slug into the search at the top of GSC's **URL Inspection** tool, or run this from the repo root to scan every backend post:

```bash
python3 -c "
import re, urllib.request
slugs = ['tamil-uraigalil-pothuvaana-pizhaigal']  # your list
for slug in slugs:
    html = urllib.request.urlopen(f'https://www.prooftamil.com/blog/{slug}', timeout=15).read().decode('utf-8','replace')
    h2 = len(re.findall(r'<h2[ >]', html))
    print(f'{slug}: H2={h2}')
"
```

Posts with `H2 < 4` are candidates.

### 2. Delete the existing post
- **Via admin UI:** go to `/my-blogs`, find the post, click delete.
- **Via API:**
  ```bash
  curl -X DELETE \
    -H "Cookie: access_token=$ADMIN_TOKEN" \
    https://www.prooftamil.com/api/blog/posts/<id>
  ```
  (get `<id>` from the post listing or admin UI)

This frees the slug. Without deleting first, the regenerated post will hit a unique-slug constraint at the backend and fail.

### 3. Run the generator
The next `queued` topic in `data/blog-queue.yaml` will be picked up. If you want to regenerate a SPECIFIC topic, make sure that topic is the next `queued` entry (move it up by editing the file, or use `--topic-index N` to force-pick).

```bash
ADMIN_TOKEN='<jwt>' node express-frontend/scripts/generate-scheduled-blog.js
```

### 4. Review the new draft + publish
Open `/my-blogs`, find the new draft, edit anything that needs polish, click Publish. The fresh post inherits all the SEO improvements (5+ H2s, ≥2 internal links, 140-160 char meta description, etc.) that current Stage 1 enforces.

## Stage 2 (next PR)

A GitHub Action will run this script on a Mon/Wed/Fri 6am IST cron and create a GitHub issue with the review link, so you don't have to remember to run it manually.

## Stage 3 (later)

Backend `scheduled` status + auto-publish cron — for posts you've explicitly approved-with-schedule, auto-publish at the chosen time. Today the human-approval step is "click Publish in admin UI"; Stage 3 makes it "schedule for tomorrow 9am".

# SEO Improvement Guide — prooftamil.com

Based on your Google Search Console data (84 clicks, 1.38K impressions, 6.1% CTR, ~9.9 avg position over 3 months), here are **actionable steps** to grow organic performance.

---

## 1. Improve CTR (Click-Through Rate)

Your **6.1% CTR** is decent; small gains here multiply quickly.

- **Titles:** Make them benefit-led and include "Free" where true.
  - Example: `ProofTamil - Free Tamil Grammar Checker & AI Proofreading | prooftamil.com` ✓ (already strong)
  - For blog/tools: start with the benefit, e.g. *"How to Check Tamil Grammar Online Free — Step-by-Step"*
- **Meta descriptions:** Keep under ~155 characters, include a clear call-to-action and one main keyword.
  - Example: *"Check Tamil grammar and spelling free. Fix Tamil writing in seconds. No sign-up required. Try ProofTamil now."*
- **In Search Console:** Use the Performance report → filter by "Queries" → find high-impression, low-CTR queries and create or update pages that match those queries and use the above title/description pattern.

---

## 2. Improve Average Position (Move from ~10 into Top 5)

- **Target long-tail keywords** where you can rank faster:
  - e.g. "tamil grammar checker free online", "tanglish to tamil converter", "tamil spell check online", "tamil proofreading tool free"
- **Dedicated landing pages:** You already have `/free-tamil-editor`, `/how-to-use`, `/tools/ocr`, etc. Ensure each has:
  - One clear primary keyword in `<h1>` and title
  - 300–600+ words of unique, helpful content
  - Internal links from homepage and blog
- **Blog content:** Publish 1–2 posts per month targeting questions like:
  - "How to check Tamil grammar online?"
  - "Tanglish to Tamil typing tips"
  - "Tamil spelling mistakes and how to fix them"
  Use the same keywords in title, first paragraph, and one subheading.

---

## 3. Technical SEO (Already in Place — Verify)

| Item | Status | Action |
|------|--------|--------|
| **Sitemap** | ✅ `/sitemap.xml` | In GSC: **Sitemaps** → confirm `https://prooftamil.com/sitemap.xml` is submitted and read without errors. |
| **robots.txt** | ✅ Allows `/`, tools, blog; Sitemap URL present | No change needed unless you add new sections. |
| **Canonical URLs** | ✅ In `config/seo.js` per page | Ensure no duplicate content (e.g. `/home` 301s to `/` ✓). |
| **Structured data** | ✅ Brand, WebApplication, Organization, FAQ | Use [Rich Results Test](https://search.google.com/test/rich-results) for homepage and 1–2 key pages. |
| **Mobile & Core Web Vitals** | Check in GSC | **Experience → Core Web Vitals** — fix any "Poor" URLs (e.g. reduce LCP by optimizing images, defer non-critical JS). |

---

## 4. Indexing & Coverage

- **GSC → Indexing → Pages:** See if "Crawled - currently not indexed" or "Discovered - currently not indexed" is high. If yes, ensure those URLs are linked from the sitemap and from at least one important page (home, blog index, or tool index).
- **Request indexing** for your top 5–10 URLs (home, `/free-tamil-editor`, `/how-to-use`, main tools) via **URL Inspection → Request indexing** (use sparingly).
- **Fix any "Excluded" or "Error" pages** listed under Coverage.

---

## 5. Content & Internal Linking

- **Homepage:** Keep one clear `<h1>` (e.g. "Improve Your Tamil Writing with AI-Powered Proofreading") and 2–3 short paragraphs. Link to `/free-tamil-editor`, `/how-to-use`, and 2–3 tools.
- **Blog:** Each post should link to at least one product page (e.g. "Try our free Tamil grammar checker") and optionally to another related post.
- **Tools pages:** Add a 1–2 sentence intro and a "Related: Free Tamil Editor, How to Use ProofTamil" block at the bottom.

---

## 6. Quick Wins Already Done in Codebase

- **robots.txt:** Crawl-delay removed for Googlebot; Bingbot allowed to crawl without delay so indexing isn’t slowed.
- **Sitemap:** Includes static pages + blog posts (cached). Ensure backend blog API returns published posts so sitemap stays complete.
- **Structured data:** Brand, WebApplication, Organization, FAQ on the homepage for rich results.

---

## 7. What to Monitor in Search Console

- **Performance → Queries:** Grow impressions for 2–3 target keywords (e.g. "tamil grammar checker", "tamil proofreading free").
- **Performance → Pages:** Double down on pages that get impressions but low clicks — improve title/description first.
- **Experience → Core Web Vitals:** Aim for all "Good" on mobile; fix "Poor" URLs.
- **Indexing → Pages:** Aim to reduce "Discovered - not indexed" over time by strengthening internal links and sitemap.

---

## Summary Checklist

- [ ] Refine **titles and meta descriptions** for top 5 pages (home, free editor, how-to-use, blog, one tool) for CTR.
- [ ] Add or expand **content** on key landing pages (300–600 words, one clear keyword per page).
- [ ] Publish **1–2 blog posts** per month targeting long-tail Tamil grammar/writing queries.
- [ ] In GSC: confirm **sitemap** OK, fix **Coverage** errors, **request indexing** for 5–10 key URLs.
- [ ] Run **Rich Results Test** and **Core Web Vitals** for homepage and fix any issues.
- [ ] Improve **internal links** from blog and tools to homepage and free editor.

Consistency (monthly content + quarterly title/description tweaks based on GSC data) will help impressions and clicks grow over the next 3–6 months.

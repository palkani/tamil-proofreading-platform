/**
 * SEO quality gate for AI-generated blog drafts.
 * Returns { passed, failures, warnings, report } so the caller can decide
 * whether to publish or reject. Conservative thresholds — designed to keep
 * thin/spammy AI output out of the indexable site.
 */

function runQualityGate({
  title,
  keyword,
  metaDescription,
  contentMarkdown,
  suggestedInternalLinks = [],
  minWords = 1500,
}) {
  const failures = [];
  const warnings = [];

  const text = String(contentMarkdown || '');
  const wordCount = countWords(text);
  const titleStr = String(title || '');
  const keywordStr = String(keyword || '').trim();
  const metaStr = String(metaDescription || '');
  const lcText = text.toLowerCase();
  const lcKeyword = keywordStr.toLowerCase();

  // ── Title ──────────────────────────────────────────────────────────
  if (!titleStr) failures.push('Missing title.');
  else {
    if (titleStr.length < 30) warnings.push(`Title is short (${titleStr.length} chars; ideal 50-65).`);
    if (titleStr.length > 70) warnings.push(`Title is long (${titleStr.length} chars; ideal 50-65, max ~65 for SERP).`);
    if (keywordStr && !titleStr.toLowerCase().includes(lcKeyword)) {
      failures.push(`Title does not contain primary keyword "${keywordStr}".`);
    }
  }

  // ── Meta description ───────────────────────────────────────────────
  if (!metaStr) failures.push('Missing meta description.');
  else {
    if (metaStr.length < 100) warnings.push(`Meta description is short (${metaStr.length} chars; ideal 140-160).`);
    if (metaStr.length > 170) warnings.push(`Meta description is long (${metaStr.length} chars; SERP truncates ~160).`);
    if (keywordStr && !metaStr.toLowerCase().includes(lcKeyword)) {
      warnings.push(`Meta description does not contain primary keyword "${keywordStr}".`);
    }
  }

  // ── Word count ─────────────────────────────────────────────────────
  // 10% slack matches the wrapping AI service's "MUST write EXACTLY N words
  // (±10% tolerance)" — Gemini routinely drifts a bit short of target, and
  // a post that's 1481 words instead of 1500 is functionally identical for
  // SEO. Fail only on substantively-short content.
  const hardMin = Math.floor(minWords * 0.9);
  if (wordCount < hardMin) {
    failures.push(`Word count ${wordCount} < required ${hardMin} (target ${minWords}, 10% slack).`);
  } else if (wordCount < minWords) {
    warnings.push(`Word count ${wordCount} slightly below target ${minWords} (within 10% slack).`);
  } else if (wordCount > minWords * 3) {
    warnings.push(`Word count ${wordCount} is unusually high; consider splitting into multiple posts.`);
  }

  // ── Heading structure ──────────────────────────────────────────────
  const h1Count = (text.match(/^# .+$/gm) || []).length;
  const h2Count = (text.match(/^## .+$/gm) || []).length;
  const h3Count = (text.match(/^### .+$/gm) || []).length;
  if (h1Count > 1) warnings.push(`Found ${h1Count} H1s — should be exactly 1 (the title is rendered as H1).`);
  if (h2Count < 4) failures.push(`Only ${h2Count} H2 heading(s) — need at least 4 for a long-form post.`);
  if (h3Count < 2) warnings.push(`Only ${h3Count} H3 heading(s) — at least 2 helps reader scanning.`);

  // ── Keyword presence in body ───────────────────────────────────────
  if (keywordStr) {
    const occurrences = countOccurrences(lcText, lcKeyword);
    if (occurrences === 0) failures.push(`Primary keyword "${keywordStr}" never appears in body.`);
    else if (occurrences < 2) warnings.push(`Primary keyword appears only ${occurrences}× in body — aim for 3-6.`);
    else if (occurrences > Math.max(15, wordCount / 60)) {
      warnings.push(`Keyword appears ${occurrences}× — may look like keyword stuffing.`);
    }

    // First-paragraph mention (rough proxy: first 400 chars of body)
    const firstChunk = lcText.slice(0, 400);
    if (!firstChunk.includes(lcKeyword)) {
      warnings.push('Primary keyword not mentioned in the opening paragraph (first ~400 chars).');
    }
  }

  // ── Internal links ─────────────────────────────────────────────────
  const linkRegex = /\]\((https?:\/\/[^)]+|\/[^)]+)\)/g;
  const allLinks = [...text.matchAll(linkRegex)].map((m) => m[1]);
  const internalLinks = allLinks.filter(
    (u) => u.startsWith('/') || u.includes('prooftamil.com')
  );
  const externalLinks = allLinks.filter(
    (u) => !u.startsWith('/') && !u.includes('prooftamil.com')
  );

  if (internalLinks.length < 2) {
    failures.push(`Only ${internalLinks.length} internal link(s) — need at least 2 (suggested: ${suggestedInternalLinks.join(', ')}).`);
  }
  if (externalLinks.length === 0) {
    warnings.push('No external links — adding 1-2 authoritative outbound links boosts E-E-A-T signals.');
  }

  // Check at least one of the suggested internal links is actually used
  if (suggestedInternalLinks.length > 0) {
    const matched = suggestedInternalLinks.filter((slug) =>
      internalLinks.some((url) => url.includes(`/blog/${slug}`))
    );
    if (matched.length === 0) {
      warnings.push(`None of the suggested internal links were used: ${suggestedInternalLinks.join(', ')}`);
    }
  }

  // ── AI-fingerprint heuristics ──────────────────────────────────────
  // These are weak signals individually, strong as a group.
  const filler = [
    /in today'?s (?:fast-paced |digital |modern )?world/i,
    /it is no secret that/i,
    /in this (?:comprehensive )?guide/i,
    /in this article,? we will/i,
    /(?:the )?landscape of \w+ (?:has|is) (?:rapidly )?evolv/i,
    /game[- ]chang(?:er|ing)/i,
    /unlock(?:ing)? the (?:full )?potential/i,
    /delve into/i,
    /navigate the complexit/i,
  ];
  const fillerHits = filler.filter((re) => re.test(text)).length;
  if (fillerHits >= 3) {
    failures.push(`Found ${fillerHits} AI-cliché filler phrases — rewrite to sound less generated.`);
  } else if (fillerHits >= 1) {
    warnings.push(`Found ${fillerHits} AI-cliché phrase(s); consider editing them out.`);
  }

  // Repetitive sentence-start ("Furthermore,", "Moreover,", "Additionally,")
  const sentenceStarts = (text.match(/^(?:Furthermore|Moreover|Additionally|However|Therefore|Consequently),/gm) || []).length;
  if (sentenceStarts >= 5) {
    warnings.push(`${sentenceStarts} formulaic transitions — vary sentence openings to read more human.`);
  }

  // ── Build report ───────────────────────────────────────────────────
  const lines = [];
  lines.push(`  Words:        ${wordCount} (min ${minWords})`);
  lines.push(`  H2/H3:        ${h2Count} / ${h3Count}`);
  lines.push(`  Internal links: ${internalLinks.length}    External: ${externalLinks.length}`);
  if (keywordStr) {
    lines.push(`  Keyword "${keywordStr}": ${countOccurrences(lcText, lcKeyword)}× in body`);
  }
  if (failures.length) {
    lines.push('');
    lines.push('  ❌ FAILURES:');
    failures.forEach((f) => lines.push(`     - ${f}`));
  }
  if (warnings.length) {
    lines.push('');
    lines.push('  ⚠️  WARNINGS:');
    warnings.forEach((w) => lines.push(`     - ${w}`));
  }
  if (!failures.length && !warnings.length) {
    lines.push('  ✅ All checks passed.');
  }

  return {
    passed: failures.length === 0,
    failures,
    warnings,
    metrics: {
      wordCount,
      h1Count,
      h2Count,
      h3Count,
      internalLinks: internalLinks.length,
      externalLinks: externalLinks.length,
      fillerHits,
    },
    report: lines.join('\n'),
  };
}

function countWords(s) {
  return String(s)
    .replace(/```[\s\S]*?```/g, ' ') // strip code blocks
    .split(/\s+/)
    .filter(Boolean).length;
}

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  const re = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  return (haystack.match(re) || []).length;
}

module.exports = { runQualityGate };

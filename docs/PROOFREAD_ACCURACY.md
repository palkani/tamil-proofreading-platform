# Tamil Proofreading Accuracy — Methodology

**Status:** v1 · **Owner:** Backend · **Last measured:** _(populate after first bench run)_

Marketing claims like "94% accuracy across real-world Tamil texts" are
only defensible if we can reproduce the number. This doc explains
exactly how the number is measured, what counts as correct/incorrect,
and how to run the benchmark yourself.

---

## 1. What "accuracy" means here

We measure four related metrics per benchmark run. Marketing typically
quotes **accuracy** (Jaccard); operations typically watch **precision
+ recall** independently.

| Metric | Definition | Failure mode it catches |
|---|---|---|
| **Precision** | TP / (TP + FP) | Model returns garbage — false suggestions annoy users. |
| **Recall** | TP / (TP + FN) | Model misses real errors — undermines "94% accuracy" claim. |
| **F1** | 2·P·R / (P+R) | Balanced view. |
| **Accuracy** | TP / (TP + FP + FN) | Jaccard overlap. What marketing quotes. |

Where:
- **TP** = correction was expected AND returned (matched by `(original, corrected)` tuple)
- **FP** = returned but not expected (false positive — spurious correction)
- **FN** = expected but not returned (miss)
- Type mismatches (returned `type: sandhi` when expected `type: grammar`) are
  logged as warnings but do NOT count against precision/recall — the
  category boundary is genuinely fuzzy in practice, and users care that
  the correction is right, not what bucket it's in.

**Accuracy floor for the marketing claim** is currently **90%**, hardcoded in
`TestProofreadBenchmark` as `claimedAccuracyFloor`. The test FAILS below
that floor so you cannot silently regress into indefensible copy.

---

## 2. The test corpus

Lives at `backend/testdata/proofread_bench.jsonl`. Every line is one
case in this shape:

```json
{
  "id": "lza-01",
  "context": "rain",
  "input": "நேற்று மலை பெய்தது",
  "expected": [{"original": "மலை", "corrected": "மழை", "type": "spelling"}],
  "note": "ல/ழ/ள — rain not mountain"
}
```

The initial corpus is 22 cases across every prompt category (spelling,
semantic, grammar, punctuation, space, sandhi, compound) plus **5 "clean
text" cases** where the expected corrections array is empty. Those five
are essential — they measure whether the model INVENTS errors on
already-correct text. Without them, precision is undefined.

### Adding new cases

1. Find a real Tamil error (or a clean-text specimen) you want to lock down.
2. Append one line to the JSONL with a new `id`.
3. Run the benchmark. If Gemini gets it wrong, decide whether to:
   - **Tighten the prompt** (add a gold example, sharpen a rule)
   - **Adjust the expected** (if it turns out our reference answer was debatable)
   - **Accept as a known miss** (mark note with `// known-miss` and move on)

### Corpus size target

**Current:** 22 cases. **Realistic v2:** 100 cases. **v3 goal:** 500 cases
covering every dialect, register, and domain we serve. Grow this in
increments of ~20 per week from real user samples (with permission).

---

## 3. How to run

```bash
cd backend

# Live-Gemini benchmark. Requires the same API key production uses.
# ~30-60 seconds for 22 cases (deliberately sequential to avoid 429).
GOOGLE_GENAI_KEY=<your-key> \
  RUN_PROOFREAD_BENCH=1 \
  go test -v -timeout 30m -run TestProofreadBenchmark \
  ./internal/services/llm/
```

Output:

```
═══ BENCHMARK RESULTS ═══════════════════════════════════════
cases=22  expected_corrections=17  returned_corrections=19
true_positives=15  false_positives=4  false_negatives=2
precision=78.9%  recall=88.2%  f1=83.3%  accuracy=71.4%

Per-type breakdown:
  spelling     tp=5 fp=1 fn=0
  semantic     tp=2 fp=0 fn=1
  grammar      tp=4 fp=2 fn=1
  ...
```

The test fails (red) if accuracy is below 90%. That's intentional — if
you can't hit 90% on your own controlled test corpus, you can't claim
94% in copy.

---

## 4. When to re-run

- **Every prompt change** (this is what protects you from silent regressions)
- **Every model version bump** (gemini-2.5-flash-lite → next flash version)
- **Before publishing a new marketing claim** with an accuracy number
- **Monthly**, as part of routine QA

Set up a GitHub Actions workflow that runs weekly against a "canary"
API key to catch model drift — Google occasionally rolls out silent
Gemini updates that shift behavior.

---

## 5. Interpreting a result

| Metric | Reading | Action |
|---|---|---|
| Precision drops | Model returning more spurious corrections | Tighten "DO NOT MARK" in prompt |
| Recall drops | Model missing real errors | Add gold examples for the missed class |
| Accuracy < floor | Both — model degraded | Investigate model version, prompt, or corpus quality |
| Per-type FP spike | Overreach in one category | Sharpen that category's boundary in the prompt |
| Per-type FN spike | Blind spot | Add examples of that class |

---

## 6. Honest limits of this methodology

- **Small corpus.** 22 cases is a sanity check, not a statistically-rigorous claim.
  A real "94% accuracy" statement should be measured on 500+ cases sampled from
  real user text (with consent).
- **Gemini's inherent variance.** The same input can produce slightly different
  output on different calls due to temperature > 0 (we use 0.1). Ideally re-run
  each case 3× and take majority; today we don't.
- **"Correct" is subjective for optional-sandhi cases.** Two competent Tamil
  editors will disagree ~5-10% of the time on borderline cases. That's the
  ceiling of ANY metric like this.
- **Type-boundary fuzziness.** `sandhi` vs `spelling` vs `grammar` overlap for
  some cases (vallinam mikuthal). The test intentionally doesn't penalize type
  mismatches — this masks a real concern but avoids over-strict reporting.

---

## 7. Publishing a marketing accuracy number

Rules before an accuracy number goes into landing-page copy:

1. Ran on ≥ 100 diverse test cases (not just the seed corpus of 22).
2. Ran on **held-out** cases (added AFTER prompt was frozen; not used to tune).
3. Ran within the last 30 days on the model version currently deployed.
4. Number is honest: report the LOWEST of accuracy/precision/recall, not
   just the flattering one.
5. Include the caveat: "measured on our internal benchmark corpus of N cases
   representing news, blog, and social Tamil text."

If any of those five is not true, downgrade the claim to "high-accuracy
Tamil proofreading" without a specific number.

---

## 8. What the current prompt is designed to hit

Current prompt (post-refactor, commit `9c2a5d4` + this commit) targets:

- **Precision ≥ 85%** — few spurious suggestions in the AI Assistant sidebar
- **Recall ≥ 90%** — catches almost all real errors in clean-text categories
- **F1 ≥ 87%**
- **Accuracy ≥ 90%** — the marketing-claim floor
- **Zero same-original-same-corrected items** (was ~33% pre-refactor)

Run the benchmark and see where we are today. Populate section 1's
"Last measured" line with the date + numbers after the first run.

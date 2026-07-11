package llm

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// Benchmark test suite that measures Gemini proofreading accuracy against a
// curated set of real Tamil test cases in ../../testdata/proofread_bench.jsonl.
// This is what backs the "94% accuracy" claim — without a repeatable
// measurement, that number is marketing, not engineering.
//
// Runs against the LIVE Gemini API, so it costs real tokens. Guarded by
// the RUN_PROOFREAD_BENCH env var so `go test ./...` doesn't accidentally
// fire it. Typical run: ~30-60s for 22 cases at ~20s each (sequential
// deliberately — parallel would trip Gemini's per-project rate limit).
//
// Usage:
//   GOOGLE_GENAI_KEY=xxx RUN_PROOFREAD_BENCH=1 \
//     go test -v -timeout 30m -run TestProofreadBenchmark \
//     ./internal/services/llm/
//
// Add cases: append lines to testdata/proofread_bench.jsonl using the
// shape { id, context, input, expected: [{original, corrected, type}], note }.
// "expected: []" is a valid case — asserts the model returns no corrections
// on clean text. These "no-op" cases are essential for measuring precision
// (false-positive rate).

type benchCase struct {
	ID       string             `json:"id"`
	Context  string             `json:"context"`
	Input    string             `json:"input"`
	Expected []expectedCorrection `json:"expected"`
	Note     string             `json:"note"`
}

type expectedCorrection struct {
	Original  string `json:"original"`
	Corrected string `json:"corrected"`
	Type      string `json:"type"`
}

func TestProofreadBenchmark(t *testing.T) {
	if os.Getenv("RUN_PROOFREAD_BENCH") == "" {
		t.Skip("Set RUN_PROOFREAD_BENCH=1 to run the live Gemini accuracy benchmark")
	}
	apiKey := os.Getenv("GOOGLE_GENAI_KEY")
	if apiKey == "" {
		t.Fatal("GOOGLE_GENAI_KEY required for live benchmark")
	}

	cases, err := loadBenchCases()
	if err != nil {
		t.Fatalf("load bench cases: %v", err)
	}
	if len(cases) == 0 {
		t.Fatal("no bench cases found")
	}
	t.Logf("Running %d benchmark cases against gemini-2.5-flash-lite", len(cases))

	var (
		totalExpected  int // sum of expected corrections across all cases
		totalReturned  int // sum of returned corrections across all cases
		truePositives  int // returned matches expected
		falsePositives int // returned but not expected
		falseNegatives int // expected but not returned
		perTypeStats   = map[string]*typeStats{}
	)

	for i, tc := range cases {
		t.Run(tc.ID, func(t *testing.T) {
			gotContent, _, err := CallGeminiProofread(tc.Input, "gemini-2.5-flash-lite", apiKey, 2048)
			if err != nil {
				t.Errorf("[%s] Gemini call failed: %v", tc.ID, err)
				return
			}
			gotCorrections, parseErr := extractCorrections(gotContent)
			if parseErr != nil {
				t.Errorf("[%s] parse response: %v (raw: %s)", tc.ID, parseErr, safeTruncate(gotContent, 200))
				return
			}

			// Match expected against returned by (original, corrected) tuple.
			// Type mismatch is a warning but not a failure — the boundary
			// between grammar/spelling/sandhi is fuzzy in practice.
			expMap := map[string]expectedCorrection{}
			for _, e := range tc.Expected {
				expMap[e.Original+"|"+e.Corrected] = e
			}
			gotMap := map[string]bool{}
			for _, g := range gotCorrections {
				key := g.Original + "|" + g.Corrected
				gotMap[key] = true
				if _, want := expMap[key]; want {
					truePositives++
					recordType(perTypeStats, g.Type, "tp")
				} else {
					falsePositives++
					recordType(perTypeStats, g.Type, "fp")
					t.Logf("[%s] FALSE POSITIVE: %q → %q (type=%s reason=%q)", tc.ID, g.Original, g.Corrected, g.Type, safeTruncate(g.Reason, 80))
				}
			}
			for key, e := range expMap {
				if !gotMap[key] {
					falseNegatives++
					recordType(perTypeStats, e.Type, "fn")
					t.Errorf("[%s] MISSED: expected %q → %q (type=%s)", tc.ID, e.Original, e.Corrected, e.Type)
				}
			}

			totalExpected += len(tc.Expected)
			totalReturned += len(gotCorrections)

			t.Logf("[%s] context=%s expected=%d returned=%d note=%s", tc.ID, tc.Context, len(tc.Expected), len(gotCorrections), tc.Note)
			// Rate-limit: sleep between calls to avoid Gemini 429
			if i < len(cases)-1 {
				time.Sleep(1500 * time.Millisecond)
			}
		})
	}

	// Precision = TP / (TP + FP) — of what we returned, how much was right
	// Recall    = TP / (TP + FN) — of what should have been caught, how much did we catch
	// F1        = 2·P·R / (P+R)
	// Accuracy  = TP / (TP + FP + FN) — Jaccard-style
	precision := safeDiv(truePositives, truePositives+falsePositives)
	recall := safeDiv(truePositives, truePositives+falseNegatives)
	f1 := safeDiv(2*truePositives, 2*truePositives+falsePositives+falseNegatives)
	accuracy := safeDiv(truePositives, truePositives+falsePositives+falseNegatives)

	t.Logf("")
	t.Logf("═══ BENCHMARK RESULTS ═══════════════════════════════════════")
	t.Logf("cases=%d  expected_corrections=%d  returned_corrections=%d", len(cases), totalExpected, totalReturned)
	t.Logf("true_positives=%d  false_positives=%d  false_negatives=%d", truePositives, falsePositives, falseNegatives)
	t.Logf("precision=%.1f%%  recall=%.1f%%  f1=%.1f%%  accuracy=%.1f%%", precision*100, recall*100, f1*100, accuracy*100)
	t.Logf("")
	t.Logf("Per-type breakdown:")
	for tName, ts := range perTypeStats {
		t.Logf("  %-12s tp=%d fp=%d fn=%d", tName, ts.tp, ts.fp, ts.fn)
	}
	t.Logf("")

	// Marketing claim gate: fail the test if accuracy falls below 90% —
	// that's the tripwire before we ever claim "94% accuracy" in copy.
	// Bump this floor as the prompt improves.
	const claimedAccuracyFloor = 0.90
	if accuracy < claimedAccuracyFloor {
		t.Errorf("Accuracy %.1f%% is BELOW the %.0f%% floor. Marketing copy claiming higher is not defensible. Tighten the prompt or re-audit test cases.", accuracy*100, claimedAccuracyFloor*100)
	}
}

// ── helpers ───────────────────────────────────────────────────────────

type typeStats struct{ tp, fp, fn int }

func recordType(m map[string]*typeStats, t string, kind string) {
	if t == "" {
		t = "unknown"
	}
	if _, ok := m[t]; !ok {
		m[t] = &typeStats{}
	}
	switch kind {
	case "tp":
		m[t].tp++
	case "fp":
		m[t].fp++
	case "fn":
		m[t].fn++
	}
}

func safeDiv(num, den int) float64 {
	if den == 0 {
		return 0
	}
	return float64(num) / float64(den)
}

func safeTruncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}

// loadBenchCases reads the JSONL test-case file from testdata/.
func loadBenchCases() ([]benchCase, error) {
	// testdata/ lives at backend/testdata (two levels up from this file's dir)
	path := filepath.Join("..", "..", "..", "testdata", "proofread_bench.jsonl")
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	var cases []benchCase
	scanner := bufio.NewScanner(f)
	// JSONL lines can be long — bump the buffer beyond the 64K default.
	scanner.Buffer(make([]byte, 1<<20), 1<<20)
	lineNo := 0
	for scanner.Scan() {
		lineNo++
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "//") {
			continue
		}
		var c benchCase
		if err := json.Unmarshal([]byte(line), &c); err != nil {
			return nil, fmt.Errorf("line %d: %w", lineNo, err)
		}
		if c.ID == "" {
			return nil, fmt.Errorf("line %d: missing id", lineNo)
		}
		cases = append(cases, c)
	}
	return cases, scanner.Err()
}

// extractCorrections parses Gemini's raw JSON response into the shape the
// benchmark needs. Mirrors the frontend/backend parse logic (accepts both
// `original`/`corrected` and `originalText`/`correction` field names).
type gotCorrection struct {
	Original  string `json:"original"`
	Corrected string `json:"corrected"`
	Reason    string `json:"reason"`
	Type      string `json:"type"`
	// alt-name variants Gemini sometimes emits
	OriginalTextAlt string `json:"originalText"`
	CorrectionAlt   string `json:"correction"`
}

func extractCorrections(raw string) ([]gotCorrection, error) {
	// Strip markdown code fences that Gemini sometimes wraps around JSON
	// despite instructions.
	raw = strings.TrimSpace(raw)
	raw = strings.TrimPrefix(raw, "```json")
	raw = strings.TrimPrefix(raw, "```")
	raw = strings.TrimSuffix(raw, "```")
	raw = strings.TrimSpace(raw)

	var wrapper struct {
		Corrections []gotCorrection `json:"corrections"`
	}
	if err := json.Unmarshal([]byte(raw), &wrapper); err != nil {
		return nil, err
	}
	// Normalise alt field names.
	out := make([]gotCorrection, 0, len(wrapper.Corrections))
	for _, c := range wrapper.Corrections {
		if c.Original == "" && c.OriginalTextAlt != "" {
			c.Original = c.OriginalTextAlt
		}
		if c.Corrected == "" && c.CorrectionAlt != "" {
			c.Corrected = c.CorrectionAlt
		}
		// Drop items where original == corrected (they shouldn't exist
		// per the prompt, but be defensive; the benchmark shouldn't
		// penalize Gemini for internal filter cleanup).
		if strings.TrimSpace(c.Original) == "" || c.Original == c.Corrected {
			continue
		}
		out = append(out, c)
	}
	return out, nil
}

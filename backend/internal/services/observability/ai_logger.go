// Package observability writes per-call AI request records to the
// ai_requests table. Every LLM invocation (Gemini today, whatever
// tomorrow) creates one row: cost, latency, tokens, model, status.
//
// Consumers are the admin cost/latency dashboard, per-user analytics,
// and future team-plan unit-economics reporting. Never contains
// prompt or response text — that would leak drafts into a
// looser-access observability path.
package observability

import (
	"log"
	"strings"
	"time"

	"tamil-proofreading-platform/backend/internal/models"

	"gorm.io/gorm"
)

// AIRequestLog is the write-time payload. Zero values are fine on
// most fields — the logger fills sensible defaults (Provider="gemini",
// OccurredAt=now).
type AIRequestLog struct {
	RequestID      string
	UserID         *uint
	OrganizationID *uint
	SubmissionID   *uint

	Provider     string // defaults to "gemini"
	Model        string
	ModelVersion string

	Status   string // one of models.AIStatus*
	CacheHit bool

	InputTokens  int
	OutputTokens int
	TotalTokens  int

	LatencyMS int

	ErrorType   string
	CountryCode string
}

// AILogger writes AI request records. Kept as a struct so the DB
// handle is injectable in tests and so a future async-batch writer
// can slot in without changing every caller.
type AILogger struct {
	db *gorm.DB
}

// NewAILogger constructs a logger bound to the given DB handle.
func NewAILogger(db *gorm.DB) *AILogger {
	return &AILogger{db: db}
}

// Log persists one AI request record asynchronously in a goroutine.
// Non-blocking by design — a failure to log MUST NOT break the
// request path, and the DB insert must not add latency to a proofread
// call that already has 1-3 seconds of Gemini round-trip. The caller
// returns immediately; the goroutine handles the insert on its own.
//
// Errors are logged to stdout so we can spot them in Cloud Run logs
// during rollout, but silently otherwise — nobody upstream needs to
// know whether the write landed.
//
// The cost calculation happens here (not at the call site) so a future
// model-pricing update only touches this file.
func (l *AILogger) Log(entry AIRequestLog) {
	if l == nil || l.db == nil {
		return
	}
	go l.doLog(entry)
}

// doLog is the synchronous inner implementation. Exposed on the struct
// so a future batch-writer refactor (once volume warrants) can call
// this from a worker without changing the Log() signature.
func (l *AILogger) doLog(entry AIRequestLog) {
	provider := strings.TrimSpace(entry.Provider)
	if provider == "" {
		provider = "gemini"
	}
	status := entry.Status
	if status == "" {
		status = models.AIStatusOK
	}
	// Prefer explicit total; fall back to input+output.
	totalTokens := entry.TotalTokens
	if totalTokens == 0 && (entry.InputTokens > 0 || entry.OutputTokens > 0) {
		totalTokens = entry.InputTokens + entry.OutputTokens
	}
	costMicros := computeCostMicros(entry.Model, entry.InputTokens, entry.OutputTokens)

	row := models.AIRequest{
		RequestID:      entry.RequestID,
		UserID:         entry.UserID,
		OrganizationID: entry.OrganizationID,
		SubmissionID:   entry.SubmissionID,
		Provider:       provider,
		Model:          entry.Model,
		ModelVersion:   entry.ModelVersion,
		Status:         status,
		CacheHit:       entry.CacheHit,
		InputTokens:    entry.InputTokens,
		OutputTokens:   entry.OutputTokens,
		TotalTokens:    totalTokens,
		CostMicros:     costMicros,
		LatencyMS:      entry.LatencyMS,
		ErrorType:      entry.ErrorType,
		CountryCode:    strings.ToUpper(strings.TrimSpace(entry.CountryCode)),
		OccurredAt:     time.Now(),
	}

	if err := l.db.Create(&row).Error; err != nil {
		log.Printf("[AI_LOG] Warning: failed to persist ai_request row (status=%s model=%s): %v", status, entry.Model, err)
	}
}

// computeCostMicros returns the dollar cost of a call expressed in
// micros ($1.00 == 1_000_000). Gemini prices are per-million-token.
// One token → cost_per_million / 1_000_000 dollars → cost_per_million
// micros. Prices refreshed 2026-01; update this table when Google
// changes pricing (they periodically halve Flash pricing at launches).
func computeCostMicros(model string, inputTokens, outputTokens int) int64 {
	// Pricing per 1M tokens, expressed in micros (US dollars × 1M).
	// Example: $0.10 per 1M tokens = 100_000 micros per 1M tokens = 0.1 micros per token.
	var inputPerMillion, outputPerMillion int64
	switch normalizeModel(model) {
	case "gemini-2.5-flash":
		inputPerMillion = 75_000  // $0.075
		outputPerMillion = 300_000 // $0.30
	case "gemini-2.0-flash", "gemini-flash":
		inputPerMillion = 100_000  // $0.10
		outputPerMillion = 400_000 // $0.40
	case "gemini-flash-lite":
		inputPerMillion = 20_000  // $0.02
		outputPerMillion = 80_000 // $0.08
	case "gemini-2.0-pro", "gemini-pro":
		inputPerMillion = 1_250_000 // $1.25
		outputPerMillion = 5_000_000 // $5.00
	default:
		// Unknown model — default to gemini-2.0-flash pricing so a
		// misconfiguration doesn't make costs look artificially zero.
		inputPerMillion = 100_000
		outputPerMillion = 400_000
	}
	inputCost := int64(inputTokens) * inputPerMillion / 1_000_000
	outputCost := int64(outputTokens) * outputPerMillion / 1_000_000
	return inputCost + outputCost
}

// normalizeModel folds friendly-name variations onto canonical keys.
func normalizeModel(m string) string {
	m = strings.ToLower(strings.TrimSpace(m))
	// Strip any version suffix like -latest, -002, -exp
	if i := strings.Index(m, "@"); i >= 0 {
		m = m[:i]
	}
	return m
}

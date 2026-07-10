package models

import "time"

// AIRequest is a per-invocation observability record for LLM calls.
// Every proofread request (authenticated or anonymous, cache hit or
// miss, success or failure) writes exactly one row here. This is the
// source of truth for cost dashboards, latency SLOs, failure alerting,
// and per-user / per-team economics.
//
// Distinct from Usage (which tracks daily aggregates for quota
// enforcement). Usage says "user 42 has used 12000 tokens today";
// AIRequest says "user 42 made a request at 14:32 UTC that took
// 1.4s, used 850 input + 320 output tokens, cost 213 micros, hit
// Gemini Flash, returned 3 corrections." Both matter; they answer
// different questions.
//
// Never contains prompt or response text — that would balloon the
// table and leak user content into an observability path that has
// looser access than the drafts table itself.
type AIRequest struct {
	ID             uint      `gorm:"primaryKey" json:"id"`
	RequestID      string    `gorm:"size:64;index" json:"request_id,omitempty"`
	UserID         *uint     `gorm:"index" json:"user_id,omitempty"`         // null for anonymous demo
	OrganizationID *uint     `gorm:"index" json:"organization_id,omitempty"` // populated when team plan ships
	SubmissionID   *uint     `gorm:"index" json:"submission_id,omitempty"`  // null for inline / cache hits with no draft

	Provider     string `gorm:"size:20;not null" json:"provider"`      // "gemini"
	Model        string `gorm:"size:50;not null" json:"model"`         // "gemini-flash", etc.
	ModelVersion string `gorm:"size:50" json:"model_version,omitempty"` // when returned by API

	// Status classifies the outcome of this call. Used for error-rate
	// alerts and cache-hit-rate dashboards. Enum via string so migrations
	// stay simple; validate at write time.
	Status   string `gorm:"size:20;not null;index" json:"status"`  // ok | cache_hit | timeout | rate_limited | api_error | client_cancelled
	CacheHit bool   `gorm:"not null;default:false" json:"cache_hit"`

	InputTokens  int   `json:"input_tokens"`
	OutputTokens int   `json:"output_tokens"`
	TotalTokens  int   `json:"total_tokens"`
	CostMicros   int64 `json:"cost_micros"` // computed at write time; $1.00 = 1_000_000 micros

	LatencyMS int `json:"latency_ms"` // end-to-end call time; 0 for cache hits

	ErrorType string `gorm:"size:50" json:"error_type,omitempty"` // "timeout", "quota_exceeded", "invalid_response", etc.

	CountryCode string `gorm:"size:2;index" json:"country_code,omitempty"` // from CDN header, for regional breakdowns

	OccurredAt time.Time `gorm:"not null;index" json:"occurred_at"`
}

// TableName pins the table name against pluralizer surprises.
func (AIRequest) TableName() string { return "ai_requests" }

// AIRequestStatus values — string constants rather than a typed enum so
// Gorm serialization stays straightforward.
const (
	AIStatusOK              = "ok"
	AIStatusCacheHit        = "cache_hit"
	AIStatusTimeout         = "timeout"
	AIStatusRateLimited     = "rate_limited"
	AIStatusAPIError        = "api_error"
	AIStatusClientCancelled = "client_cancelled"
	AIStatusInvalidResponse = "invalid_response"
)

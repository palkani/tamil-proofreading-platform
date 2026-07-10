package handlers

import (
	"net/http"
	"strconv"
	"time"

	"tamil-proofreading-platform/backend/internal/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// AdminGetAIRequestsSummary returns the aggregate cost/latency/error
// picture the admin dashboard's AI Requests page renders in one call.
// Consolidates six queries so the frontend fires one fetch and paints
// every tile.
//
// GET /api/v1/admin/ai-requests/summary?window=24h
//
// Windows: "1h", "24h", "7d", "30d". Defaults to "24h" if omitted.
func (h *Handlers) AdminGetAIRequestsSummary(c *gin.Context) {
	windowLabel := c.DefaultQuery("window", "24h")
	since, ok := parseWindow(windowLabel)
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid window; use 1h | 24h | 7d | 30d"})
		return
	}

	base := h.db.Model(&models.AIRequest{}).Where("occurred_at >= ?", since)

	// 1) Totals — one aggregate query for count, tokens, cost, and status distribution
	type totalsRow struct {
		Total          int64 `gorm:"column:total"`
		Successful     int64 `gorm:"column:successful"`
		CacheHits      int64 `gorm:"column:cache_hits"`
		Errors         int64 `gorm:"column:errors"`
		Timeouts       int64 `gorm:"column:timeouts"`
		RateLimited    int64 `gorm:"column:rate_limited"`
		InputTokens    int64 `gorm:"column:input_tokens"`
		OutputTokens   int64 `gorm:"column:output_tokens"`
		TotalTokens    int64 `gorm:"column:total_tokens"`
		CostMicros     int64 `gorm:"column:cost_micros"`
	}
	var totals totalsRow
	base.Session(&gorm.Session{}).Select(
		"COUNT(*) as total, " +
			"SUM(CASE WHEN status = 'ok' THEN 1 ELSE 0 END) as successful, " +
			"SUM(CASE WHEN status = 'cache_hit' THEN 1 ELSE 0 END) as cache_hits, " +
			"SUM(CASE WHEN status IN ('api_error','invalid_response') THEN 1 ELSE 0 END) as errors, " +
			"SUM(CASE WHEN status = 'timeout' THEN 1 ELSE 0 END) as timeouts, " +
			"SUM(CASE WHEN status = 'rate_limited' THEN 1 ELSE 0 END) as rate_limited, " +
			"COALESCE(SUM(input_tokens),0) as input_tokens, " +
			"COALESCE(SUM(output_tokens),0) as output_tokens, " +
			"COALESCE(SUM(total_tokens),0) as total_tokens, " +
			"COALESCE(SUM(cost_micros),0) as cost_micros",
	).Scan(&totals)

	// 2) Latency percentiles — computed via ORDER + LIMIT/OFFSET for
	// portability. Only counts successful requests (cache hits are
	// misleadingly fast; errors are misleadingly fast or slow).
	type latencyRow struct {
		LatencyMS int `gorm:"column:latency_ms"`
	}
	var latencyRows []int
	h.db.Model(&models.AIRequest{}).
		Where("occurred_at >= ? AND status = ?", since, models.AIStatusOK).
		Where("latency_ms > 0").
		Order("latency_ms ASC").
		Pluck("latency_ms", &latencyRows)
	p50, p95, p99 := percentiles(latencyRows)

	// 3) By-day time series for chart
	type dayRow struct {
		Day        string `json:"day" gorm:"column:day"`
		Requests   int64  `json:"requests" gorm:"column:requests"`
		CostMicros int64  `json:"cost_micros" gorm:"column:cost_micros"`
	}
	var byDay []dayRow
	base.Session(&gorm.Session{}).
		Select("TO_CHAR(DATE_TRUNC('day', occurred_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') as day, " +
			"COUNT(*) as requests, " +
			"COALESCE(SUM(cost_micros),0) as cost_micros").
		Group("day").
		Order("day ASC").
		Scan(&byDay)

	// 4) Top users by spend (excludes anonymous)
	type userRow struct {
		UserID     uint   `json:"user_id" gorm:"column:user_id"`
		Email      string `json:"email" gorm:"column:email"`
		Requests   int64  `json:"requests" gorm:"column:requests"`
		CostMicros int64  `json:"cost_micros" gorm:"column:cost_micros"`
	}
	var topUsers []userRow
	h.db.Table("ai_requests AS r").
		Select("r.user_id, u.email, COUNT(*) as requests, COALESCE(SUM(r.cost_micros),0) as cost_micros").
		Joins("JOIN users u ON u.id = r.user_id").
		Where("r.occurred_at >= ? AND r.user_id IS NOT NULL", since).
		Group("r.user_id, u.email").
		Order("cost_micros DESC").
		Limit(10).
		Scan(&topUsers)

	// 5) Breakdown by model
	type modelRow struct {
		Model      string `json:"model" gorm:"column:model"`
		Requests   int64  `json:"requests" gorm:"column:requests"`
		CostMicros int64  `json:"cost_micros" gorm:"column:cost_micros"`
	}
	var byModel []modelRow
	base.Session(&gorm.Session{}).
		Select("model, COUNT(*) as requests, COALESCE(SUM(cost_micros),0) as cost_micros").
		Group("model").
		Order("requests DESC").
		Scan(&byModel)

	// 6) Recent failures for the "what's broken right now" panel
	type failureRow struct {
		ID         uint      `json:"id"`
		OccurredAt time.Time `json:"occurred_at"`
		Status     string    `json:"status"`
		Model      string    `json:"model"`
		LatencyMS  int       `json:"latency_ms"`
		ErrorType  string    `json:"error_type"`
		UserID     *uint     `json:"user_id"`
	}
	var failures []failureRow
	h.db.Model(&models.AIRequest{}).
		Where("occurred_at >= ? AND status IN (?, ?, ?, ?)", since,
			models.AIStatusTimeout, models.AIStatusRateLimited,
			models.AIStatusAPIError, models.AIStatusInvalidResponse).
		Order("occurred_at DESC").
		Limit(20).
		Scan(&failures)

	// Derived numbers for tiles
	cacheHitRate := 0.0
	if totals.Total > 0 {
		cacheHitRate = float64(totals.CacheHits) / float64(totals.Total) * 100
	}
	errorRate := 0.0
	billedRequests := totals.Total - totals.CacheHits
	if billedRequests > 0 {
		errorRate = float64(totals.Errors+totals.Timeouts+totals.RateLimited) / float64(billedRequests) * 100
	}

	c.JSON(http.StatusOK, gin.H{
		"window":            windowLabel,
		"since":             since,
		"totals":            totals,
		"cost_usd":          microsToUSD(totals.CostMicros),
		"cache_hit_rate":    round1(cacheHitRate),
		"error_rate":        round1(errorRate),
		"latency_p50_ms":    p50,
		"latency_p95_ms":    p95,
		"latency_p99_ms":    p99,
		"by_day":            byDay,
		"top_users_by_cost": topUsers,
		"by_model":          byModel,
		"recent_failures":   failures,
	})
}

// parseWindow converts a human window label into a start timestamp.
// Second return is false when the label doesn't match a known window
// so callers can 400 rather than silently defaulting.
func parseWindow(w string) (time.Time, bool) {
	now := time.Now().UTC()
	switch w {
	case "1h":
		return now.Add(-1 * time.Hour), true
	case "24h":
		return now.Add(-24 * time.Hour), true
	case "7d":
		return now.Add(-7 * 24 * time.Hour), true
	case "30d":
		return now.Add(-30 * 24 * time.Hour), true
	}
	return time.Time{}, false
}

// percentiles computes p50/p95/p99 from a pre-sorted-ascending slice.
// Uses nearest-rank (simplest and correct for observability purposes;
// linear interpolation buys precision that a percentile from ~50
// samples doesn't have anyway).
func percentiles(sortedAsc []int) (p50, p95, p99 int) {
	n := len(sortedAsc)
	if n == 0 {
		return 0, 0, 0
	}
	idx := func(pct float64) int {
		i := int(float64(n) * pct)
		if i >= n {
			i = n - 1
		}
		if i < 0 {
			i = 0
		}
		return i
	}
	return sortedAsc[idx(0.50)], sortedAsc[idx(0.95)], sortedAsc[idx(0.99)]
}

// microsToUSD formats an integer cost-in-micros as a string like
// "$2.30" so the frontend can consume it directly without re-computing
// the decimal shift on every tile paint.
func microsToUSD(micros int64) string {
	dollars := float64(micros) / 1_000_000.0
	return "$" + strconv.FormatFloat(dollars, 'f', 4, 64)
}

// round1 rounds a percentage to one decimal for the tile displays.
func round1(v float64) float64 {
	return float64(int(v*10+0.5)) / 10
}

package ime

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"
)

// AdvancedClient provides HTTP access to the TypeScript suggestion microservice.
// Uses 5-factor ranking formula for better accuracy and context awareness.
type AdvancedClient struct {
	baseURL string
	timeout time.Duration
	client  *http.Client
}

// AdvancedSuggestion represents a suggestion from the advanced service
type AdvancedSuggestion struct {
	Text  string  `json:"text"`
	Score float64 `json:"score"`
}

// AdvancedResponse is the full response from the advanced service
type AdvancedResponse struct {
	Suggestions []AdvancedSuggestion `json:"suggestions"`
	Meta        map[string]interface{} `json:"meta"`
}

// NewAdvancedClient creates a new client for the advanced suggestion service.
//
// Parameters:
//   - baseURL: URL of the suggestion service (e.g., "http://suggest-service:8080")
//
// The client has a 50ms timeout to keep overall latency under 30ms.
func NewAdvancedClient(baseURL string) *AdvancedClient {
	return &AdvancedClient{
		baseURL: baseURL,
		timeout: 50 * time.Millisecond,
		client: &http.Client{
			Timeout: 50 * time.Millisecond,
			Transport: &http.Transport{
				MaxIdleConns:        100,
				MaxIdleConnsPerHost: 10,
				IdleConnTimeout:     90 * time.Second,
			},
		},
	}
}

// Suggest calls the advanced suggestion service for high-quality suggestions.
//
// Parameters:
//   - ctx: Request context (for cancellation)
//   - q: English/Tanglish input (e.g., "vanakkam")
//   - prev: Previous Tamil word for context awareness (optional)
//   - limit: Number of suggestions (1-10, default 5)
//
// Returns:
//   - []Candidate: Ranked suggestions with scores
//   - map[string]interface{}: Metadata (latency, branches, etc.)
//   - error: Non-nil if service call failed
//
// The service uses a 5-factor ranking formula:
//   - phoneticScore * 40 (phonetic match quality)
//   - log(wordFreq) * 30 (corpus frequency)
//   - phraseBonus * 15 (phrases > single words)
//   - contextBonus * 10 (bigram-based)
//   - acceptanceBonus * 5 (user learning)
func (ac *AdvancedClient) Suggest(ctx context.Context, q, prev string, limit int) ([]Candidate, map[string]interface{}, error) {
	// Build URL with query parameters
	endpoint := fmt.Sprintf("%s/api/suggest", ac.baseURL)
	params := url.Values{}
	params.Set("q", q)
	if limit > 0 {
		params.Set("limit", fmt.Sprintf("%d", limit))
	}
	if prev != "" {
		params.Set("prev", prev)
	}

	fullURL := fmt.Sprintf("%s?%s", endpoint, params.Encode())

	// Create request with context
	req, err := http.NewRequestWithContext(ctx, "GET", fullURL, nil)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to create request: %w", err)
	}

	// Set headers
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "ProofTamilRunner-IME/1.0")

	// Execute request
	resp, err := ac.client.Do(req)
	if err != nil {
		return nil, nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	// Check status code
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, nil, fmt.Errorf("service returned status %d: %s", resp.StatusCode, string(body))
	}

	// Parse JSON response
	var result AdvancedResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, nil, fmt.Errorf("failed to decode response: %w", err)
	}

	// Convert to Candidate format
	cands := make([]Candidate, 0, len(result.Suggestions))
	for i, s := range result.Suggestions {
		cands = append(cands, Candidate{
			Word:       s.Text,
			Score:      s.Score, // Already float64
			Source:     "advanced-5factor",
			RankReason: fmt.Sprintf("rank_%d_score_%.1f", i+1, s.Score),
		})
	}

	// Build metadata
	meta := map[string]interface{}{
		"engine":    "advanced",
		"algorithm": "5-factor-formula",
		"cache":     "miss", // Advanced service handles its own caching
	}

	// Copy relevant metadata from response
	if result.Meta != nil {
		if tookMs, ok := result.Meta["took_ms"].(float64); ok {
			meta["latency_ms"] = int(tookMs)
		}
		if branches, ok := result.Meta["branches"].(float64); ok {
			meta["branches"] = int(branches)
		}
		if candidates, ok := result.Meta["candidates"].(float64); ok {
			meta["candidates"] = int(candidates)
		}
	}

	return cands, meta, nil
}

// Health checks if the advanced service is reachable.
// Returns nil if healthy, error otherwise.
func (ac *AdvancedClient) Health(ctx context.Context) error {
	endpoint := fmt.Sprintf("%s/health", ac.baseURL)
	
	req, err := http.NewRequestWithContext(ctx, "GET", endpoint, nil)
	if err != nil {
		return fmt.Errorf("failed to create health check request: %w", err)
	}

	resp, err := ac.client.Do(req)
	if err != nil {
		return fmt.Errorf("health check failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("health check returned status %d", resp.StatusCode)
	}

	return nil
}

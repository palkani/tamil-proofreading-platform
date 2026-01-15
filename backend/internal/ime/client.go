package ime

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

// Candidate represents a ranked Tamil word.
type Candidate struct {
	Word       string  `json:"word"`
	Score      float64 `json:"score"`
	Source     string  `json:"source"`
	RankReason string  `json:"rank_reason,omitempty"`
}

type aksharaRequest struct {
	Text  string `json:"text"`
	Mode  string `json:"mode"`
	Limit int    `json:"limit,omitempty"`
}

type aksharaResponse struct {
	// Legacy Aksharamukha adapter response fields
	Output string   `json:"output,omitempty"`
	Result string   `json:"result,omitempty"`
	Words  []string `json:"words,omitempty"`

	// ProofTamilRunner-compatible response fields
	Success     bool `json:"success,omitempty"`
	Suggestions []struct {
		Word       string  `json:"word,omitempty"`
		Ta         string  `json:"ta,omitempty"`
		Text       string  `json:"text,omitempty"`
		Suggestion string  `json:"suggestion,omitempty"`
		Score      float64 `json:"score,omitempty"`
	} `json:"suggestions,omitempty"`
}

type Client struct {
	BaseURL string
	HTTP    *http.Client
	APIKey  string
	ClientID string
}

func NewClient(baseURL string) *Client {
	// ProofTamilRunner security headers (optional for local dev; required in production deployments)
	clientID := strings.TrimSpace(os.Getenv("RUNNER_CLIENT_ID"))
	if clientID == "" {
		clientID = strings.TrimSpace(os.Getenv("CLIENT_ID"))
	}
	if clientID == "" {
		clientID = "prooftamil-backend"
	}
	apiKey := strings.TrimSpace(os.Getenv("RUNNER_API_KEY"))
	if apiKey == "" {
		apiKey = strings.TrimSpace(os.Getenv("API_KEY"))
	}

	return &Client{
		BaseURL: strings.TrimRight(baseURL, "/"),
		HTTP: &http.Client{
			Timeout: 2 * time.Second,
		},
		APIKey: apiKey,
		ClientID: clientID,
	}
}

func (c *Client) Transliterate(ctx context.Context, text, mode string, limit int) ([]string, error) {
	if c == nil || c.BaseURL == "" {
		return nil, errors.New("aksharamukha client not configured")
	}
	if limit <= 0 {
		limit = 8
	}
	payload := aksharaRequest{Text: text, Mode: mode, Limit: limit}
	b, _ := json.Marshal(payload)
	url := c.BaseURL
	if !strings.HasSuffix(url, "/transliterate") {
		url = url + "/transliterate"
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(b))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	// ProofTamilRunner requires headers on all endpoints except /health
	if c.ClientID != "" {
		req.Header.Set("X-Client-Id", c.ClientID)
	}
	if c.APIKey != "" {
		req.Header.Set("X-API-Key", c.APIKey)
	}

	resp, err := c.HTTP.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)

	var ar aksharaResponse
	if err := json.Unmarshal(body, &ar); err != nil {
		return nil, fmt.Errorf("aksharamukha decode: %w", err)
	}

	// Prefer ProofTamilRunner-style suggestions when available
	words := make([]string, 0, 16)
	if len(ar.Suggestions) > 0 {
		for _, s := range ar.Suggestions {
			w := strings.TrimSpace(s.Word)
			if w == "" {
				w = strings.TrimSpace(s.Ta)
			}
			if w == "" {
				w = strings.TrimSpace(s.Text)
			}
			if w == "" {
				w = strings.TrimSpace(s.Suggestion)
			}
			if w != "" {
				words = append(words, w)
			}
		}
	}

	// Fallback to legacy fields (output/result/words)
	if len(ar.Words) > 0 {
		words = append(words, ar.Words...)
	}
	out := strings.TrimSpace(ar.Output)
	if out == "" {
		out = strings.TrimSpace(ar.Result)
	}
	if out != "" {
		words = append(words, out)
	}

	// Deduplicate while preserving order
	seen := make(map[string]bool, len(words))
	deduped := make([]string, 0, len(words))
	for _, w := range words {
		w = strings.TrimSpace(w)
		if w == "" || seen[w] {
			continue
		}
		seen[w] = true
		deduped = append(deduped, w)
	}
	return deduped, nil
}

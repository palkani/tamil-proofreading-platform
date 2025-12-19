package ime

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
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
	Text string `json:"text"`
	Mode string `json:"mode"`
}

type aksharaResponse struct {
	Output string   `json:"output,omitempty"`
	Result string   `json:"result,omitempty"`
	Words  []string `json:"words,omitempty"`
}

type Client struct {
	BaseURL string
	HTTP    *http.Client
}

func NewClient(baseURL string) *Client {
	return &Client{
		BaseURL: strings.TrimRight(baseURL, "/"),
		HTTP: &http.Client{
			Timeout: 300 * time.Millisecond,
		},
	}
}

func (c *Client) Transliterate(ctx context.Context, text, mode string) ([]string, error) {
	if c == nil || c.BaseURL == "" {
		return nil, errors.New("aksharamukha client not configured")
	}
	payload := aksharaRequest{Text: text, Mode: mode}
	b, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.BaseURL+"/transliterate", bytes.NewReader(b))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

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
	out := ar.Output
	if out == "" {
		out = ar.Result
	}
	words := ar.Words
	if out != "" {
		words = append(words, out)
	}
	return words, nil
}

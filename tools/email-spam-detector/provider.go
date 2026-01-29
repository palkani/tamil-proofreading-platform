package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"strings"
	"time"
)

// ProviderResult holds the response from an external spam-check API.
type ProviderResult struct {
	IsSpam bool    `json:"is_spam"`
	Score  float64 `json:"score"`
	Error  string  `json:"error,omitempty"`
}

var (
	providerURL     string
	providerAPIKey  string
	providerEnabled bool
	providerClient  = &http.Client{Timeout: 10 * time.Second}
)

// ConfigureProvider sets the external spam-check API URL and optional API key.
func ConfigureProvider(url, apiKey string) {
	providerURL = strings.TrimSpace(url)
	providerAPIKey = strings.TrimSpace(apiKey)
	providerEnabled = providerURL != ""
}

// CheckProvider calls the external API with subject+body and returns result.
func CheckProvider(subject, body string) (ProviderResult, bool) {
	if !providerEnabled {
		return ProviderResult{}, false
	}
	reqBody, _ := json.Marshal(map[string]string{"subject": subject, "body": body})
	req, err := http.NewRequest(http.MethodPost, providerURL, bytes.NewReader(reqBody))
	if err != nil {
		return ProviderResult{Error: err.Error()}, true
	}
	req.Header.Set("Content-Type", "application/json")
	if providerAPIKey != "" {
		req.Header.Set("Authorization", "Bearer "+providerAPIKey)
		req.Header.Set("X-API-Key", providerAPIKey)
	}
	resp, err := providerClient.Do(req)
	if err != nil {
		return ProviderResult{Error: err.Error()}, true
	}
	defer resp.Body.Close()
	var out struct {
		IsSpam *bool   `json:"is_spam"`
		Score  *float64 `json:"score"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return ProviderResult{Error: "invalid JSON: " + err.Error()}, true
	}
	r := ProviderResult{}
	if out.IsSpam != nil {
		r.IsSpam = *out.IsSpam
	}
	if out.Score != nil {
		r.Score = *out.Score
	} else if r.IsSpam {
		r.Score = 75
	} else {
		r.Score = 25
	}
	return r, true
}

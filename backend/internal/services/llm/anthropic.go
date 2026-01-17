package llm

import (
        "bytes"
        "context"
        "encoding/json"
        "fmt"
        "io"
        "net/http"
        "strings"
        "time"
)

// Reusable HTTP client for Anthropic with connection pooling.
var anthropicClient = &http.Client{
        Timeout: 25 * time.Second,
        Transport: &http.Transport{
                MaxIdleConns:        10,
                MaxIdleConnsPerHost: 5,
                IdleConnTimeout:     90 * time.Second,
        },
}

type anthropicMessageResponse struct {
        Content []struct {
                Type string `json:"type"`
                Text string `json:"text"`
        } `json:"content"`
}

// CallAnthropicProofread calls Anthropic Messages API and returns the raw JSON text response from the model.
func CallAnthropicProofread(ctx context.Context, userText string, model string, apiKey string) (string, error) {
        if strings.TrimSpace(apiKey) == "" {
                return "", &ProviderError{Provider: "anthropic", Message: "API key not provided", Retryable: false}
        }

        // Use same schema prompt for consistency across providers
        finalPrompt := strings.Replace(proofreadingPrompt, "[USER'S TAMIL TEXT HERE]", userText, 1)

        payload := map[string]any{
                "model":       model,
                "max_tokens":  2048,
                "temperature": 0.1,
                "system":      "Return ONLY valid JSON. No markdown, no code fences.",
                "messages": []map[string]any{
                        {
                                "role": "user",
                                "content": []map[string]any{
                                        {"type": "text", "text": finalPrompt},
                                },
                        },
                },
        }

        jsonBody, err := json.Marshal(payload)
        if err != nil {
                return "", &ProviderError{Provider: "anthropic", Message: "failed to build request", Retryable: false}
        }

        req, err := http.NewRequestWithContext(ctx, "POST", "https://api.anthropic.com/v1/messages", bytes.NewReader(jsonBody))
        if err != nil {
                return "", &ProviderError{Provider: "anthropic", Message: "failed to build request", Retryable: false}
        }
        req.Header.Set("Content-Type", "application/json")
        req.Header.Set("x-api-key", apiKey)
        req.Header.Set("anthropic-version", "2023-06-01")

        resp, err := anthropicClient.Do(req)
        if err != nil {
                return "", &ProviderError{Provider: "anthropic", Message: err.Error(), Retryable: true}
        }
        defer resp.Body.Close()

        bodyBytes, err := io.ReadAll(resp.Body)
        if err != nil {
                return "", &ProviderError{Provider: "anthropic", StatusCode: resp.StatusCode, Message: "failed reading response", Retryable: true}
        }

        if resp.StatusCode < 200 || resp.StatusCode >= 300 {
                // body is usually JSON with error details; include a short prefix for debugging
                msg := strings.TrimSpace(string(bodyBytes))
                if len(msg) > 600 {
                        msg = msg[:600]
                }
                retryable := resp.StatusCode == 429 || resp.StatusCode == 408 || resp.StatusCode >= 500
                return "", &ProviderError{Provider: "anthropic", StatusCode: resp.StatusCode, Message: msg, Retryable: retryable}
        }

        var parsed anthropicMessageResponse
        if err := json.Unmarshal(bodyBytes, &parsed); err != nil {
                // Some responses may still be plain text; return body as-is
                return strings.TrimSpace(string(bodyBytes)), nil
        }

        for _, c := range parsed.Content {
                if c.Type == "text" && strings.TrimSpace(c.Text) != "" {
                        return c.Text, nil
                }
        }
        return "", fmt.Errorf("anthropic: empty content")
}



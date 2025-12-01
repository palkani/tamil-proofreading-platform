package handlers

import (
        "encoding/json"
        "fmt"
        "io"
        "net/http"
        "strings"
        "time"

        "tamil-proofreading-platform/backend/internal/logger"
        "tamil-proofreading-platform/backend/internal/services/ai"
)

type ProcessRequest struct {
        Text string `json:"text"`
        Mode string `json:"mode"`
}

type ProcessResponse struct {
        Success     bool        `json:"success"`
        Result      interface{} `json:"result,omitempty"`
        Error       string      `json:"error,omitempty"`
        ProcessTime float64     `json:"process_time_ms,omitempty"`
}

var validModes = map[string]bool{
        "correct":   true,
        "rewrite":   true,
        "shorten":   true,
        "lengthen":  true,
        "translate": true,
}

func ProcessHandler(w http.ResponseWriter, r *http.Request) {
        if r.Method != http.MethodPost {
                w.Header().Set("Content-Type", "application/json")
                w.WriteHeader(http.StatusMethodNotAllowed)
                json.NewEncoder(w).Encode(ProcessResponse{
                        Success: false,
                        Error:   "Method not allowed",
                })
                return
        }

        // Get client IP
        ip := getClientIP(r)

        // Read body
        body, err := io.ReadAll(r.Body)
        if err != nil {
                logger.LogError("parse", err)
                w.Header().Set("Content-Type", "application/json")
                w.WriteHeader(http.StatusBadRequest)
                json.NewEncoder(w).Encode(ProcessResponse{
                        Success: false,
                        Error:   "Failed to read request body",
                })
                return
        }
        defer r.Body.Close()

        // Parse JSON
        var req ProcessRequest
        err = json.Unmarshal(body, &req)
        if err != nil {
                logger.LogError("parse", err)
                w.Header().Set("Content-Type", "application/json")
                w.WriteHeader(http.StatusBadRequest)
                json.NewEncoder(w).Encode(ProcessResponse{
                        Success: false,
                        Error:   "Invalid JSON",
                })
                return
        }

        // Validate text
        if strings.TrimSpace(req.Text) == "" {
                logger.LogValidationError(ip, "text", "text is empty")
                w.Header().Set("Content-Type", "application/json")
                w.WriteHeader(http.StatusBadRequest)
                json.NewEncoder(w).Encode(ProcessResponse{
                        Success: false,
                        Error:   "Text cannot be empty",
                })
                return
        }

        // Validate mode
        if req.Mode == "" {
                req.Mode = "correct"
        }
        if !validModes[req.Mode] {
                logger.LogValidationError(ip, "mode", fmt.Sprintf("invalid mode: %s", req.Mode))
                w.Header().Set("Content-Type", "application/json")
                w.WriteHeader(http.StatusBadRequest)
                json.NewEncoder(w).Encode(ProcessResponse{
                        Success: false,
                        Error:   fmt.Sprintf("Invalid mode. Must be one of: correct, rewrite, shorten, lengthen, translate"),
                })
                return
        }

        // Validate text length
        if len([]rune(req.Text)) > 3000 {
                logger.LogValidationError(ip, "text", "text exceeds 3000 characters")
                w.Header().Set("Content-Type", "application/json")
                w.WriteHeader(http.StatusBadRequest)
                json.NewEncoder(w).Encode(ProcessResponse{
                        Success: false,
                        Error:   "Text exceeds maximum length of 3000 characters",
                })
                return
        }

        // Log request
        textLen := len([]rune(req.Text))
        logger.LogRequest(ip, req.Mode, textLen)

        // Process with AI
        startTime := time.Now()
        result, err := ai.ProcessText(req.Mode, req.Text)
        duration := time.Since(startTime)
        logger.LogResponseTime(req.Mode, duration)

        if err != nil {
                logger.LogAIError(req.Mode, "ai_processing_error", err)
                w.Header().Set("Content-Type", "application/json")
                w.WriteHeader(http.StatusInternalServerError)
                json.NewEncoder(w).Encode(ProcessResponse{
                        Success:     false,
                        Error:       fmt.Sprintf("AI processing failed: %v", err),
                        ProcessTime: duration.Seconds() * 1000,
                })
                return
        }

        // Success response
        w.Header().Set("Content-Type", "application/json")
        w.WriteHeader(http.StatusOK)
        json.NewEncoder(w).Encode(ProcessResponse{
                Success:     true,
                Result:      result,
                ProcessTime: duration.Seconds() * 1000,
        })
}

func getClientIP(r *http.Request) string {
        // Check X-Forwarded-For first (for proxies)
        if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
                ips := strings.Split(xff, ",")
                if len(ips) > 0 {
                        return strings.TrimSpace(ips[0])
                }
        }

        // Check X-Real-IP
        if xri := r.Header.Get("X-Real-IP"); xri != "" {
                return xri
        }

        // Fall back to remote address
        return strings.Split(r.RemoteAddr, ":")[0]
}

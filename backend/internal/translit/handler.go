package translit

import (
	"encoding/json"
	"io"
	"net/http"
)

type TransliterateRequest struct {
	Text string `json:"text"`
}

type TransliterateResponse struct {
	Success     bool         `json:"success"`
	Suggestions []Suggestion `json:"suggestions,omitempty"`
	Error       string       `json:"error,omitempty"`
}

func TransliterateHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		json.NewEncoder(w).Encode(TransliterateResponse{
			Success: false,
			Error:   "method not allowed",
		})
		return
	}

	// Read request body
	body, err := io.ReadAll(r.Body)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(TransliterateResponse{
			Success: false,
			Error:   "failed to read request body",
		})
		return
	}
	defer r.Body.Close()

	// Parse JSON
	var req TransliterateRequest
	if err := json.Unmarshal(body, &req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(TransliterateResponse{
			Success: false,
			Error:   "invalid json",
		})
		return
	}

	// Validate input
	if req.Text == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(TransliterateResponse{
			Success: false,
			Error:   "text required",
		})
		return
	}

	// Get suggestions
	suggestions := GetSuggestions(req.Text)

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(TransliterateResponse{
		Success:     true,
		Suggestions: suggestions,
	})
}

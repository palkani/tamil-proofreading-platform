package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"tamil-proofreading-platform/backend/internal/config"
	"tamil-proofreading-platform/backend/internal/ime"
)

// fake runner server
func newFakeRunner(t *testing.T) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"success":true,"output":"எனது","request_id":"test"}`))
	}))
}

func TestIMESuggest_ReturnsCandidates(t *testing.T) {
	gin.SetMode(gin.TestMode)
	fake := newFakeRunner(t)
	defer fake.Close()

	svc := ime.NewService(".", fake.URL, true, true)
	h := &Handlers{cfg: &config.Config{IMEEnabled: true}, imeSvc: svc, imeEnabled: true}

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	req, _ := http.NewRequest("GET", "/api/v1/ime/suggest?q=enathu&limit=8", nil)
	c.Request = req

	h.IMESuggest(c)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	var body map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("invalid json: %v", err)
	}
	if body["success"] != true {
		t.Fatalf("success should be true")
	}
	sugg, ok := body["suggestions"].([]interface{})
	if !ok || len(sugg) == 0 {
		t.Fatalf("expected suggestions")
	}
}

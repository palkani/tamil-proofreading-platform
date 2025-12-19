package handlers

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"tamil-proofreading-platform/backend/internal/config"
	"tamil-proofreading-platform/backend/internal/ime"
)

// stub service returns fixed candidate
type stubIMEService struct{}

func (s *stubIMEService) Suggest(ctx context.Context, q, mode string, limit int) ([]ime.Candidate, map[string]interface{}) {
	return []ime.Candidate{{Word: "எனது", Score: 1}}, map[string]interface{}{"cache": "miss", "latency_ms": 1}
}

func TestIMESuggest_EmptyQuery(t *testing.T) {
	gin.SetMode(gin.TestMode)
	cfg := &config.Config{IMEEnabled: true}
	h := &Handlers{cfg: cfg, imeSvc: ime.NewService(".", "", true), imeEnabled: true}
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request, _ = http.NewRequest("GET", "/api/v1/ime/suggest?q=", nil)
	h.IMESuggest(c)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
}

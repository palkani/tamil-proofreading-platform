package handlers

import (
	"net/http"
	"strings"

	"tamil-proofreading-platform/backend/internal/middleware"
	"tamil-proofreading-platform/backend/internal/models"
	"tamil-proofreading-platform/backend/internal/util/geo"

	"github.com/gin-gonic/gin"
)

// UpdateUserCountry lets an authenticated user set or update their
// stored country_code. Also called implicitly at first checkout via
// CreateCheckoutSession — but exposing it explicitly lets the frontend
// save a country the moment a user browses the pricing page (before
// they even try to subscribe), so the pricing tile shows the correct
// currency immediately.
//
// Body accepts either an explicit country_code or asks us to infer from
// the request's CDN IP header:
//
//	{ "country_code": "IN" }        — explicit
//	{ "detect": true }              — read X-Vercel-IP-Country
//
// Constraints:
//
//   - Must be authenticated (middleware upstream)
//   - Ignored if BillingCountryLocked is already true (post-payment
//     country is trusted from Dodo; frontend cannot override)
//   - Country must be exactly 2 uppercase letters (ISO 3166-1 alpha-2)
//
// POST /api/v1/user/country
func (h *Handlers) UpdateUserCountry(c *gin.Context) {
	userID, err := middleware.GetUserFromContext(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	var body struct {
		CountryCode string `json:"country_code"`
		Detect      bool   `json:"detect"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	code := strings.ToUpper(strings.TrimSpace(body.CountryCode))
	if body.Detect && code == "" {
		code = geo.CountryFromContext(c)
	}
	if len(code) != 2 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "country_code must be a 2-letter ISO code"})
		return
	}

	var user models.User
	if err := h.db.First(&user, userID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}
	if user.BillingCountryLocked {
		c.JSON(http.StatusConflict, gin.H{
			"error":                 "billing country is locked from a prior payment",
			"country_code":          user.CountryCode,
			"billing_country_locked": true,
		})
		return
	}

	if err := h.db.Model(&user).Update("country_code", code).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "update failed"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"country_code":           code,
		"billing_country_locked": false,
	})
}

// DetectCountry is a public endpoint that returns whatever the CDN's
// IP header says, without touching the DB or requiring auth. Frontend
// calls this on page load (esp. pricing page) to render currency
// symbols and India-discounted prices before the user has logged in.
//
// Response: { "country_code": "IN" } or { "country_code": "" } when
// the header isn't present (dev/local, headers stripped, etc.).
//
// GET /api/v1/geo/country
func (h *Handlers) DetectCountry(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"country_code": geo.CountryFromContext(c)})
}


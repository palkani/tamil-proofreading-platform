// Package geo derives the visitor's country from platform-provided request
// headers. We deliberately avoid third-party geolocation APIs — the CDN
// already has this data and injects it for free, so a lookup would be
// a redundant network hop and an unnecessary rate-limit risk.
//
// Precedence (first match wins):
//
//	X-Vercel-IP-Country   — set by Vercel on every request; primary path
//	CF-IPCountry          — set by Cloudflare; used if you switch CDNs
//	X-Country-Code        — explicit client override (dev / testing)
//
// All results are ISO-3166-1 alpha-2, uppercased. Empty string means
// "no signal available" — callers should treat that as "unknown" and
// fall back to whatever they were doing before.
package geo

import (
	"strings"

	"github.com/gin-gonic/gin"
)

// CountryFromContext returns the two-letter country code the CDN
// attached to the request, or "" if none is present. Never returns
// a stale or synthesized value; always fresh off the current request
// headers.
func CountryFromContext(c *gin.Context) string {
	for _, header := range []string{
		"X-Vercel-IP-Country",
		"CF-IPCountry",
		"X-Country-Code",
	} {
		v := strings.TrimSpace(c.GetHeader(header))
		if v == "" {
			continue
		}
		// Cloudflare uses "XX" for "unknown" — treat that as no signal.
		if strings.EqualFold(v, "XX") || strings.EqualFold(v, "T1") {
			continue
		}
		if len(v) != 2 {
			continue
		}
		return strings.ToUpper(v)
	}
	return ""
}

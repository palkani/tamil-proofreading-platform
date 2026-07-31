package billing

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"log"
	"math"
	"time"

	"tamil-proofreading-platform/backend/internal/models"

	"gorm.io/gorm"
)

const (
	// India country code
	IndiaCountryCode = "IN"
	// Default FX rate validity — use rate from last 7 days (fallback auto-seeds if expired)
	FXRateMaxAgeDays = 7
	// Quote validity duration
	QuoteValidityMinutes = 30
	// Fallback USD/INR rate used when DB has no recent rate
	fallbackINRRate = 84.0
)

var (
	ErrPlanNotFound     = errors.New("plan not found")
	ErrPlanInactive     = errors.New("plan is not active")
	ErrFXRateNotFound   = errors.New("fx rate not found")
	ErrFXRateExpired    = errors.New("fx rate is too old")
	ErrInvalidSignature = errors.New("invalid quote signature")
)

// PricingService handles all pricing and FX calculations
type PricingService struct {
	db           *gorm.DB
	quoteSecret  string // HMAC secret for signing quotes
}

// NewPricingService creates a new pricing service
func NewPricingService(db *gorm.DB, quoteSecret string) *PricingService {
	if quoteSecret == "" {
		quoteSecret = "default-quote-secret-change-in-production"
	}
	return &PricingService{
		db:          db,
		quoteSecret: quoteSecret,
	}
}

// GetPlan retrieves a plan by code
func (s *PricingService) GetPlan(planCode string) (*models.Plan, error) {
	var plan models.Plan
	if err := s.db.Where("code = ?", planCode).First(&plan).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrPlanNotFound
		}
		return nil, err
	}
	if !plan.Active {
		return nil, ErrPlanInactive
	}
	return &plan, nil
}

// GetLatestFXRate retrieves the most recent FX rate for USD to target currency
func (s *PricingService) GetLatestFXRate(quoteCurrency string) (*models.FXRate, error) {
	var fxRate models.FXRate
	maxAge := time.Now().AddDate(0, 0, -FXRateMaxAgeDays)
	
	if err := s.db.Where("base_currency = ? AND quote_currency = ? AND as_of_date >= ?",
		"USD", quoteCurrency, maxAge).
		Order("as_of_date DESC").
		First(&fxRate).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrFXRateNotFound
		}
		return nil, err
	}
	
	return &fxRate, nil
}

// IsIndiaUser determines if user should be routed to India pricing
func (s *PricingService) IsIndiaUser(countryCode string) bool {
	return countryCode == IndiaCountryCode
}

// GetProvider determines which payment provider to use based on country
func (s *PricingService) GetProvider(countryCode string) models.PaymentProvider {
	if s.IsIndiaUser(countryCode) {
		return models.PaymentProviderRazorpay
	}
	return models.PaymentProviderStripe
}

// CalculatePricing calculates the final price for a user based on their country
func (s *PricingService) CalculatePricing(planCode, countryCode string) (*models.PricingQuote, error) {
	plan, err := s.GetPlan(planCode)
	if err != nil {
		return nil, err
	}
	
	quote := &models.PricingQuote{
		PlanCode:          planCode,
		BasePriceUSDCents: plan.BasePriceUSD,
		CountryCode:       countryCode,
		Provider:          string(s.GetProvider(countryCode)),
		ValidUntil:        time.Now().Add(time.Minute * QuoteValidityMinutes).UTC().Format(time.RFC3339),
	}
	
	if s.IsIndiaUser(countryCode) {
		quote.IsIndiaPrice = true
		quote.Currency = "INR"

		// India DISCOUNT REMOVED (2026-07): we no longer apply IndiaMultiplier, so the
		// displayed price matches the Dodo/Razorpay product price. Preferred path is a
		// fixed INR price on the plan (india_fixed_price_inr_cents), which is exact and
		// bypasses FX. If that isn't set, we convert the FULL USD base at the FX rate —
		// no percentage discount either way.
		if plan.IndiaFixedPriceINRCents > 0 {
			// Fixed INR price — bypass FX entirely so it exactly matches the payment
			// provider's product price.
			quote.FinalPriceCents = plan.IndiaFixedPriceINRCents
			quote.FinalPriceUSDCents = plan.BasePriceUSD // keep USD base for reference
			quote.DiscountPercent = 0
		} else {
			// No fixed price: charge the FULL USD base converted to INR (no discount).
			quote.FinalPriceUSDCents = plan.BasePriceUSD
			quote.DiscountPercent = 0

			// Convert to INR — fall back to hardcoded rate if DB has no recent entry
			fxRate, err := s.GetLatestFXRate("INR")
			if err != nil {
				if errors.Is(err, ErrFXRateNotFound) || errors.Is(err, ErrFXRateExpired) {
					log.Printf("[PRICING] No recent INR FX rate in DB, seeding fallback %.2f", fallbackINRRate)
					_ = s.SaveFXRate("USD", "INR", fallbackINRRate, "fallback")
					fxRate = &models.FXRate{Rate: fallbackINRRate, AsOfDate: time.Now().Truncate(24 * time.Hour)}
				} else {
					return nil, fmt.Errorf("failed to get INR FX rate: %w", err)
				}
			}

			// Round to nearest paisa (1 INR = 100 paise)
			inrCents := int(math.Round(float64(plan.BasePriceUSD) * fxRate.Rate))
			quote.FinalPriceCents = inrCents
			quote.FXRate = fxRate.Rate
			quote.FXRateAsOfDate = fxRate.AsOfDate.Format("2006-01-02")
		}
	} else {
		// Non-India: charge full USD price
		quote.FinalPriceUSDCents = plan.BasePriceUSD
		quote.FinalPriceCents = plan.BasePriceUSD
		quote.Currency = "USD"
		quote.IsIndiaPrice = false
	}
	
	// Sign the quote to prevent tampering
	quote.QuoteSignature = s.signQuote(quote)
	
	log.Printf("[PRICING] Calculated quote: plan=%s country=%s base=%d final=%d %s provider=%s",
		planCode, countryCode, quote.BasePriceUSDCents, quote.FinalPriceCents, quote.Currency, quote.Provider)
	
	return quote, nil
}

// VerifyQuote verifies that a quote hasn't been tampered with
func (s *PricingService) VerifyQuote(quote *models.PricingQuote) error {
	// Check expiry
	validUntil, err := time.Parse(time.RFC3339, quote.ValidUntil)
	if err != nil || time.Now().After(validUntil) {
		return errors.New("quote has expired")
	}
	
	// Verify signature
	expectedSig := s.signQuote(quote)
	if quote.QuoteSignature != expectedSig {
		return ErrInvalidSignature
	}
	
	return nil
}

// signQuote creates an HMAC signature for a quote
func (s *PricingService) signQuote(quote *models.PricingQuote) string {
	// Create a canonical string representation
	data := fmt.Sprintf("%s|%d|%d|%s|%s|%s|%.6f",
		quote.PlanCode,
		quote.BasePriceUSDCents,
		quote.FinalPriceCents,
		quote.Currency,
		quote.CountryCode,
		quote.ValidUntil,
		quote.FXRate,
	)
	
	h := hmac.New(sha256.New, []byte(s.quoteSecret))
	h.Write([]byte(data))
	return hex.EncodeToString(h.Sum(nil))
}

// SaveFXRate saves a new FX rate to the database
func (s *PricingService) SaveFXRate(baseCurrency, quoteCurrency string, rate float64, source string) error {
	fxRate := &models.FXRate{
		BaseCurrency:  baseCurrency,
		QuoteCurrency: quoteCurrency,
		Rate:          rate,
		AsOfDate:      time.Now().Truncate(24 * time.Hour), // Truncate to date
		Source:        source,
	}
	
	// Use upsert to update if exists for today
	return s.db.Where("base_currency = ? AND quote_currency = ? AND as_of_date = ?",
		baseCurrency, quoteCurrency, fxRate.AsOfDate).
		Assign(*fxRate).
		FirstOrCreate(fxRate).Error
}

// GetAllPlans returns all active plans
func (s *PricingService) GetAllPlans() ([]models.Plan, error) {
	var plans []models.Plan
	if err := s.db.Where("active = ?", true).Find(&plans).Error; err != nil {
		return nil, err
	}
	return plans, nil
}

// FormatPrice formats price for display
func (s *PricingService) FormatPrice(cents int, currency string) string {
	switch currency {
	case "INR":
		// Indian Rupees: ₹1,234.56
		rupees := float64(cents) / 100
		return fmt.Sprintf("₹%.2f", rupees)
	case "USD":
		// US Dollars: $12.34
		dollars := float64(cents) / 100
		return fmt.Sprintf("$%.2f", dollars)
	default:
		return fmt.Sprintf("%d %s", cents, currency)
	}
}

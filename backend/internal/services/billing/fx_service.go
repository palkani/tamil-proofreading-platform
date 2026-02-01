package billing

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"

	"gorm.io/gorm"
)

// FXService handles foreign exchange rate updates
type FXService struct {
	db         *gorm.DB
	httpClient *http.Client
	apiKey     string // For external FX API if needed
}

// NewFXService creates a new FX service
func NewFXService(db *gorm.DB, apiKey string) *FXService {
	return &FXService{
		db: db,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
		apiKey: apiKey,
	}
}

// ExchangeRateAPIResponse represents a response from exchangerate-api.com
type ExchangeRateAPIResponse struct {
	Result       string             `json:"result"`
	BaseCode     string             `json:"base_code"`
	Rates        map[string]float64 `json:"conversion_rates"`
	TimeLastUpdate string           `json:"time_last_update_utc"`
}

// UpdateFXRates fetches and stores the latest FX rates
// This should be called by a cron job daily
func (s *FXService) UpdateFXRates() error {
	log.Println("[FX] Starting FX rate update...")
	
	// Try multiple sources for redundancy
	sources := []func() (float64, error){
		s.fetchFromExchangeRateAPI,
		s.fetchFromFallback,
	}
	
	var rate float64
	var err error
	var source string
	
	for i, fetchFunc := range sources {
		rate, err = fetchFunc()
		if err == nil && rate > 0 {
			switch i {
			case 0:
				source = "exchangerate-api"
			case 1:
				source = "fallback"
			}
			break
		}
		log.Printf("[FX] Source %d failed: %v", i, err)
	}
	
	if rate <= 0 {
		return fmt.Errorf("failed to fetch FX rate from all sources: %w", err)
	}
	
	// Save to database
	pricingService := NewPricingService(s.db, "")
	if err := pricingService.SaveFXRate("USD", "INR", rate, source); err != nil {
		return fmt.Errorf("failed to save FX rate: %w", err)
	}
	
	log.Printf("[FX] Updated USD/INR rate: %.4f (source: %s)", rate, source)
	return nil
}

func (s *FXService) fetchFromExchangeRateAPI() (float64, error) {
	// Free tier available at exchangerate-api.com
	// For production, use a paid plan with higher limits
	
	url := "https://open.er-api.com/v6/latest/USD"
	if s.apiKey != "" {
		url = fmt.Sprintf("https://v6.exchangerate-api.com/v6/%s/latest/USD", s.apiKey)
	}
	
	resp, err := s.httpClient.Get(url)
	if err != nil {
		return 0, fmt.Errorf("http request failed: %w", err)
	}
	defer resp.Body.Close()
	
	if resp.StatusCode != http.StatusOK {
		return 0, fmt.Errorf("api returned status %d", resp.StatusCode)
	}
	
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return 0, fmt.Errorf("failed to read response: %w", err)
	}
	
	var apiResp ExchangeRateAPIResponse
	if err := json.Unmarshal(body, &apiResp); err != nil {
		return 0, fmt.Errorf("failed to parse response: %w", err)
	}
	
	if apiResp.Result != "success" {
		return 0, fmt.Errorf("api result not success: %s", apiResp.Result)
	}
	
	rate, ok := apiResp.Rates["INR"]
	if !ok {
		return 0, fmt.Errorf("INR rate not found in response")
	}
	
	return rate, nil
}

func (s *FXService) fetchFromFallback() (float64, error) {
	// Fallback rate - should be updated periodically
	// In production, use multiple redundant API sources
	
	// Current market rate as of 2024 (approximately)
	// This should be updated if all APIs fail
	return 83.50, nil
}

// GetCurrentRate returns the current USD/INR rate from database
func (s *FXService) GetCurrentRate() (float64, error) {
	pricingService := NewPricingService(s.db, "")
	fxRate, err := pricingService.GetLatestFXRate("INR")
	if err != nil {
		return 0, err
	}
	return fxRate.Rate, nil
}

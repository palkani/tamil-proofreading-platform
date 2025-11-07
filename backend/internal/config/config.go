package config

import (
	"os"

	"github.com/joho/godotenv"
)

type Config struct {
	DatabaseURL          string
	Port                 string
	FrontendURL          string
	JWTSecret            string
	OpenAIAPIKey         string
	HuggingFaceAPIKey    string
	StripeSecretKey      string
	StripeWebhookSecret  string
	RazorpayKeyID        string
	RazorpayKeySecret    string
	GoogleClientID       string
	GoogleClientSecret   string
	FacebookClientID     string
	FacebookClientSecret string
	TwilioAccountSID     string
	TwilioAuthToken      string
	TwilioPhoneNumber    string
}

func Load() *Config {
	// Load .env file if it exists (ignore error if it doesn't)
	_ = godotenv.Load()

	return &Config{
		DatabaseURL:          getEnv("DATABASE_URL", "postgres://user:password@localhost:5432/tamil_proofreading?sslmode=disable"),
		Port:                 getEnv("PORT", "8080"),
		FrontendURL:          getEnv("FRONTEND_URL", "http://localhost:3000"),
		JWTSecret:            getEnv("JWT_SECRET", "change-this-secret-key-in-production"),
		OpenAIAPIKey:         getEnv("OPENAI_API_KEY", ""),
		HuggingFaceAPIKey:    getEnv("HUGGINGFACE_API_KEY", ""),
		StripeSecretKey:      getEnv("STRIPE_SECRET_KEY", ""),
		StripeWebhookSecret:  getEnv("STRIPE_WEBHOOK_SECRET", ""),
		RazorpayKeyID:        getEnv("RAZORPAY_KEY_ID", ""),
		RazorpayKeySecret:    getEnv("RAZORPAY_KEY_SECRET", ""),
		GoogleClientID:       getEnv("GOOGLE_CLIENT_ID", ""),
		GoogleClientSecret:   getEnv("GOOGLE_CLIENT_SECRET", ""),
		FacebookClientID:     getEnv("FACEBOOK_CLIENT_ID", ""),
		FacebookClientSecret: getEnv("FACEBOOK_CLIENT_SECRET", ""),
		TwilioAccountSID:     getEnv("TWILIO_ACCOUNT_SID", ""),
		TwilioAuthToken:      getEnv("TWILIO_AUTH_TOKEN", ""),
		TwilioPhoneNumber:    getEnv("TWILIO_PHONE_NUMBER", ""),
	}
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}


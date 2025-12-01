package auth

import (
	"fmt"
	"log"
	"os"
)

// SendPasswordResetEmail sends a password reset email to the user (mock for now)
func SendPasswordResetEmail(email, rawToken string) error {
	frontendURL := os.Getenv("FRONTEND_URL")
	if frontendURL == "" {
		frontendURL = "http://localhost:3000"
	}

	resetLink := fmt.Sprintf("%s/reset-password?token=%s", frontendURL, rawToken)

	// Mock: log to console
	log.Printf("[EMAIL] Sending password reset email to: %s", email)
	log.Printf("[EMAIL] Reset link: %s", resetLink)
	log.Printf("[EMAIL] ===== EMAIL BODY START =====")
	log.Printf("[EMAIL] To: %s", email)
	log.Printf("[EMAIL] Subject: Password Reset Request")
	log.Printf("[EMAIL]")
	log.Printf("[EMAIL] Dear User,")
	log.Printf("[EMAIL]")
	log.Printf("[EMAIL] You requested a password reset for your ProofTamil account.")
	log.Printf("[EMAIL] Click the link below to reset your password:")
	log.Printf("[EMAIL]")
	log.Printf("[EMAIL] %s", resetLink)
	log.Printf("[EMAIL]")
	log.Printf("[EMAIL] This link will expire in 1 hour.")
	log.Printf("[EMAIL] If you did not request this, please ignore this email.")
	log.Printf("[EMAIL]")
	log.Printf("[EMAIL] Best regards,")
	log.Printf("[EMAIL] ProofTamil Team")
	log.Printf("[EMAIL] ===== EMAIL BODY END =====")

	// TODO: Integrate with real email service (SMTP, SendGrid, Resend, etc.)
	// Example implementation:
	// - Load SMTP credentials from environment
	// - Use net/smtp or third-party package
	// - Send actual email

	return nil
}

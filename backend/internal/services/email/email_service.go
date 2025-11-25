package email

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"
)

type EmailService struct {
	apiKey    string
	fromEmail string
	fromName  string
}

type ResendEmailRequest struct {
	From    string   `json:"from"`
	To      []string `json:"to"`
	Subject string   `json:"subject"`
	HTML    string   `json:"html"`
}

type ResendResponse struct {
	ID string `json:"id"`
}

func NewEmailService() *EmailService {
	apiKey := os.Getenv("RESEND_API_KEY")
	fromEmail := os.Getenv("EMAIL_FROM_ADDRESS")
	if fromEmail == "" {
		fromEmail = "noreply@prooftamil.com"
	}
	fromName := os.Getenv("EMAIL_FROM_NAME")
	if fromName == "" {
		fromName = "ProofTamil"
	}

	return &EmailService{
		apiKey:    apiKey,
		fromEmail: fromEmail,
		fromName:  fromName,
	}
}

func (s *EmailService) IsConfigured() bool {
	return s.apiKey != ""
}

func (s *EmailService) SendEmail(to, subject, htmlBody string) error {
	if !s.IsConfigured() {
		log.Printf("[EMAIL] Resend API not configured, skipping email to: %s", to)
		return nil
	}

	payload := ResendEmailRequest{
		From:    fmt.Sprintf("%s <%s>", s.fromName, s.fromEmail),
		To:      []string{to},
		Subject: subject,
		HTML:    htmlBody,
	}

	jsonBody, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	client := &http.Client{
		Timeout: 10 * time.Second,
	}

	req, err := http.NewRequest("POST", "https://api.resend.com/emails", bytes.NewReader(jsonBody))
	if err != nil {
		return err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+s.apiKey)

	resp, err := client.Do(req)
	if err != nil {
		log.Printf("[EMAIL] Request error: %v", err)
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		log.Printf("[EMAIL] Error response status: %d", resp.StatusCode)
		return fmt.Errorf("email send failed with status: %d", resp.StatusCode)
	}

	log.Printf("[EMAIL] Email sent successfully to: %s", to)
	return nil
}

func (s *EmailService) SendVerificationEmail(to, otp string) error {
	subject := "Verify your ProofTamil account - OTP Code"
	htmlBody := fmt.Sprintf(`
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background-color: #f5f5f5;">
    <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
        <div style="background: linear-gradient(135deg, #ea580c 0%%, #f97316 100%%); padding: 30px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 28px;">தமிழ்</h1>
            <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">ProofTamil</p>
        </div>
        
        <div style="padding: 40px 30px;">
            <h2 style="color: #1f2937; margin: 0 0 20px 0; font-size: 24px;">Verify Your Email</h2>
            <p style="color: #4b5563; font-size: 16px; line-height: 1.6; margin: 0 0 25px 0;">
                Welcome to ProofTamil! Please use the following verification code to complete your registration:
            </p>
            
            <div style="background-color: #fff7ed; border: 2px solid #ea580c; border-radius: 8px; padding: 25px; text-align: center; margin: 25px 0;">
                <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #ea580c;">%s</span>
            </div>
            
            <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin: 25px 0 0 0;">
                This code will expire in <strong>15 minutes</strong>. If you didn't request this verification, please ignore this email.
            </p>
        </div>
        
        <div style="background-color: #f9fafb; padding: 20px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
            <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                © 2024 ProofTamil. Your AI Writing Partner for Tamil.
            </p>
        </div>
    </div>
</body>
</html>
`, otp)

	return s.SendEmail(to, subject, htmlBody)
}

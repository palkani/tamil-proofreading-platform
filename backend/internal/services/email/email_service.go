package email

import (
	"bytes"
	"encoding/json"
	"fmt"
	"html"
	"log"
	"net/http"
	"net/smtp"
	"os"
	"strconv"
	"strings"
	"time"
)

type EmailService struct {
	apiKey    string
	fromEmail string
	fromName  string

	// SMTP (SendGrid) configuration
	smtpHost string
	smtpPort int
	smtpUser string
	smtpPass string

	// Contact notification destination
	contactTo string
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
	fromEmail := strings.TrimSpace(os.Getenv("EMAIL_FROM_ADDRESS"))
	if fromEmail == "" {
		// Default to prooftamil@gmail.com — must be verified in SendGrid (Single Sender or Domain).
		// Use noreply@prooftamil.com only after domain authentication in SendGrid.
		fromEmail = "prooftamil@gmail.com"
	}
	fromName := os.Getenv("EMAIL_FROM_NAME")
	if fromName == "" {
		fromName = "ProofTamil"
	}

	// SendGrid SMTP defaults
	smtpHost := strings.TrimSpace(os.Getenv("SENDGRID_SMTP_HOST"))
	if smtpHost == "" {
		smtpHost = "smtp.sendgrid.net"
	}
	smtpPort := 587
	if v := strings.TrimSpace(os.Getenv("SENDGRID_SMTP_PORT")); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 65535 {
			smtpPort = n
		}
	}
	smtpUser := strings.TrimSpace(os.Getenv("SENDGRID_SMTP_USER"))
	if smtpUser == "" {
		// SendGrid recommends username "apikey" with the API key as password.
		smtpUser = "apikey"
	}
	smtpPass := strings.TrimSpace(os.Getenv("SENDGRID_SMTP_PASSWORD"))

	contactTo := strings.TrimSpace(os.Getenv("CONTACT_TO_EMAIL"))
	if contactTo == "" {
		contactTo = "prooftamil@gmail.com"
	}

	return &EmailService{
		apiKey:    apiKey,
		fromEmail: fromEmail,
		fromName:  fromName,
		smtpHost:  smtpHost,
		smtpPort:  smtpPort,
		smtpUser:  smtpUser,
		smtpPass:  smtpPass,
		contactTo: contactTo,
	}
}

func (s *EmailService) IsConfigured() bool {
	return s.apiKey != ""
}

func (s *EmailService) smtpConfigured() bool {
	return strings.TrimSpace(s.smtpHost) != "" && s.smtpPort > 0 && strings.TrimSpace(s.smtpUser) != "" && strings.TrimSpace(s.smtpPass) != ""
}

func (s *EmailService) sendSMTP(to, subject, htmlBody string, replyTo string) error {
	if !s.smtpConfigured() {
		log.Printf("[EMAIL] SMTP not configured, skipping email to: %s (set SENDGRID_SMTP_PASSWORD; host=%s port=%d user=%s)",
			to, s.smtpHost, s.smtpPort, s.smtpUser)
		return nil
	}

	from := fmt.Sprintf("%s <%s>", s.fromName, s.fromEmail)
	addr := fmt.Sprintf("%s:%d", s.smtpHost, s.smtpPort)
	auth := smtp.PlainAuth("", s.smtpUser, s.smtpPass, s.smtpHost)

	// Minimal RFC 5322 message with HTML body.
	var msg strings.Builder
	msg.WriteString(fmt.Sprintf("From: %s\r\n", from))
	msg.WriteString(fmt.Sprintf("To: %s\r\n", to))
	msg.WriteString(fmt.Sprintf("Subject: %s\r\n", subject))
	if strings.TrimSpace(replyTo) != "" {
		msg.WriteString(fmt.Sprintf("Reply-To: %s\r\n", strings.TrimSpace(replyTo)))
	}
	msg.WriteString("MIME-Version: 1.0\r\n")
	msg.WriteString("Content-Type: text/html; charset=UTF-8\r\n")
	msg.WriteString("\r\n")
	msg.WriteString(htmlBody)

	log.Printf("[EMAIL] Sending SMTP email (provider=sendgrid host=%s port=%d from=%s to=%s subject=%q)", s.smtpHost, s.smtpPort, s.fromEmail, to, subject)
	if err := smtp.SendMail(addr, auth, s.fromEmail, []string{to}, []byte(msg.String())); err != nil {
		log.Printf("[EMAIL] SMTP send failed: %v", err)
		if strings.Contains(err.Error(), "verified Sender Identity") || strings.Contains(err.Error(), "550") {
			log.Printf("[EMAIL] Hint: Set EMAIL_FROM_ADDRESS to a verified sender in SendGrid (Settings → Sender Authentication). See https://sendgrid.com/docs/for-developers/sending-email/sender-identity/")
		}
		return err
	}
	log.Printf("[EMAIL] SMTP email sent successfully to: %s", to)
	return nil
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

// SendContactEmail sends a notification for contact-form submissions.
// Uses SendGrid SMTP when configured; otherwise, it will no-op.
func (s *EmailService) SendContactEmail(fromUserEmail, subject, message string) error {
	to := strings.TrimSpace(s.contactTo)
	if to == "" {
		to = "contact@prooftamil.com"
	}

	safeFrom := strings.TrimSpace(fromUserEmail)
	if safeFrom == "" {
		safeFrom = "(unknown)"
	}
	safeSubject := strings.TrimSpace(subject)
	if safeSubject == "" {
		safeSubject = "(no subject)"
	}
	safeMessage := strings.TrimSpace(message)

	// Use exactly what the user typed as the email subject.
	emailSubject := safeSubject
	// Keep the email body as the message content (with minimal wrapping).
	htmlBody := fmt.Sprintf(
		`<div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; line-height: 1.6; white-space: pre-wrap;">%s</div>`,
		html.EscapeString(safeMessage),
	)

	// Set Reply-To so you can reply directly to the user's email from Gmail.
	replyTo := ""
	if safeFrom != "(unknown)" {
		replyTo = safeFrom
	}
	return s.sendSMTP(to, emailSubject, htmlBody, replyTo)
}

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
	apiKey         string // Resend API key
	sendgridApiKey string // SendGrid Web API key (v3)
	fromEmail      string
	fromName       string

	// SMTP configuration (fallback)
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
	ReplyTo []string `json:"reply_to,omitempty"`
}

type ResendResponse struct {
	ID string `json:"id"`
}

func NewEmailService() *EmailService {
	apiKey := os.Getenv("RESEND_API_KEY")
	fromEmail := strings.TrimSpace(os.Getenv("EMAIL_FROM_ADDRESS"))
	if fromEmail == "" {
		fromEmail = "prooftamil@gmail.com"
	}
	fromName := os.Getenv("EMAIL_FROM_NAME")
	if fromName == "" {
		fromName = "ProofTamil"
	}

	// SendGrid Web API key — reuse the SMTP password since it's the same API key.
	sendgridApiKey := strings.TrimSpace(os.Getenv("SENDGRID_API_KEY"))
	if sendgridApiKey == "" {
		sendgridApiKey = strings.TrimSpace(os.Getenv("SENDGRID_SMTP_PASSWORD"))
	}

	// SMTP fallback
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
		smtpUser = "apikey"
	}
	smtpPass := strings.TrimSpace(os.Getenv("SENDGRID_SMTP_PASSWORD"))

	contactTo := strings.TrimSpace(os.Getenv("CONTACT_TO_EMAIL"))
	if contactTo == "" {
		contactTo = "prooftamil@gmail.com"
	}

	return &EmailService{
		apiKey:         apiKey,
		sendgridApiKey: sendgridApiKey,
		fromEmail:      fromEmail,
		fromName:       fromName,
		smtpHost:       smtpHost,
		smtpPort:       smtpPort,
		smtpUser:       smtpUser,
		smtpPass:       smtpPass,
		contactTo:      contactTo,
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

	log.Printf("[EMAIL] Sending SMTP email (host=%s port=%d from=%s to=%s subject=%q)", s.smtpHost, s.smtpPort, s.fromEmail, to, subject)
	if err := smtp.SendMail(addr, auth, s.fromEmail, []string{to}, []byte(msg.String())); err != nil {
		log.Printf("[EMAIL] SMTP send failed: %v", err)
		if strings.Contains(err.Error(), "verified Sender Identity") || strings.Contains(err.Error(), "550") {
			log.Printf("[EMAIL] Hint: Verify the sender %s in SendGrid (Settings → Sender Authentication).", s.fromEmail)
		}
		return err
	}
	log.Printf("[EMAIL] SMTP email sent successfully to: %s", to)
	return nil
}

// sendViaSendGridAPI uses SendGrid's v3 Web API (HTTP, no SMTP auth issues).
func (s *EmailService) sendViaSendGridAPI(to, subject, htmlBody, replyTo string) error {
	if s.sendgridApiKey == "" {
		return fmt.Errorf("SendGrid API key not configured")
	}

	type sgEmail struct {
		Email string `json:"email"`
		Name  string `json:"name,omitempty"`
	}
	type sgContent struct {
		Type  string `json:"value"`
		Value string `json:"value"`
	}
	type sgPersonalization struct {
		To      []sgEmail `json:"to"`
		Subject string    `json:"subject"`
	}
	type sgRequest struct {
		From             sgEmail             `json:"from"`
		Personalizations []sgPersonalization `json:"personalizations"`
		Content          []struct {
			Type  string `json:"type"`
			Value string `json:"value"`
		} `json:"content"`
		ReplyToList []sgEmail `json:"reply_to_list,omitempty"`
	}

	payload := sgRequest{
		From: sgEmail{Email: s.fromEmail, Name: s.fromName},
		Personalizations: []sgPersonalization{
			{To: []sgEmail{{Email: to}}, Subject: subject},
		},
		Content: []struct {
			Type  string `json:"type"`
			Value string `json:"value"`
		}{
			{Type: "text/html", Value: htmlBody},
		},
	}
	if replyTo != "" {
		payload.ReplyToList = []sgEmail{{Email: replyTo}}
	}

	jsonBody, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	client := &http.Client{Timeout: 10 * time.Second}
	req, err := http.NewRequest("POST", "https://api.sendgrid.com/v3/mail/send", bytes.NewReader(jsonBody))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+s.sendgridApiKey)

	resp, err := client.Do(req)
	if err != nil {
		log.Printf("[EMAIL] SendGrid API request error: %v", err)
		return err
	}
	defer resp.Body.Close()

	// SendGrid returns 202 Accepted on success.
	if resp.StatusCode >= 400 {
		log.Printf("[EMAIL] SendGrid API error status: %d", resp.StatusCode)
		if resp.StatusCode == 403 {
			log.Printf("[EMAIL] Hint: Verify sender %s in SendGrid (Settings → Sender Authentication).", s.fromEmail)
		}
		return fmt.Errorf("SendGrid API send failed with status: %d", resp.StatusCode)
	}
	return nil
}

func (s *EmailService) sendViaResend(payload ResendEmailRequest) error {
	jsonBody, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	client := &http.Client{Timeout: 10 * time.Second}
	req, err := http.NewRequest("POST", "https://api.resend.com/emails", bytes.NewReader(jsonBody))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+s.apiKey)

	resp, err := client.Do(req)
	if err != nil {
		log.Printf("[EMAIL] Resend request error: %v", err)
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		log.Printf("[EMAIL] Resend error response status: %d", resp.StatusCode)
		return fmt.Errorf("email send failed with status: %d", resp.StatusCode)
	}
	return nil
}

func (s *EmailService) SendEmail(to, subject, htmlBody string) error {
	if !s.IsConfigured() {
		log.Printf("[EMAIL] Resend API not configured, skipping email to: %s", to)
		return nil
	}

	err := s.sendViaResend(ResendEmailRequest{
		From:    fmt.Sprintf("%s <%s>", s.fromName, s.fromEmail),
		To:      []string{to},
		Subject: subject,
		HTML:    htmlBody,
	})
	if err != nil {
		return err
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
// Priority: Resend API → SendGrid Web API → SMTP.
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

	htmlBody := fmt.Sprintf(
		`<div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; line-height: 1.6; white-space: pre-wrap;">%s</div>`,
		html.EscapeString(safeMessage),
	)

	replyTo := ""
	if safeFrom != "(unknown)" {
		replyTo = safeFrom
	}

	// 1. Try Resend API (if configured).
	if s.IsConfigured() {
		payload := ResendEmailRequest{
			From:    fmt.Sprintf("%s <%s>", s.fromName, s.fromEmail),
			To:      []string{to},
			Subject: safeSubject,
			HTML:    htmlBody,
		}
		if replyTo != "" {
			payload.ReplyTo = []string{replyTo}
		}
		if err := s.sendViaResend(payload); err != nil {
			log.Printf("[EMAIL] Resend contact email failed: %v — trying SendGrid API", err)
		} else {
			log.Printf("[EMAIL] Contact email sent via Resend to: %s", to)
			return nil
		}
	}

	// 2. Try SendGrid Web API (uses same API key as SMTP, but HTTP-based — no TLS auth issues).
	if s.sendgridApiKey != "" {
		if err := s.sendViaSendGridAPI(to, safeSubject, htmlBody, replyTo); err != nil {
			log.Printf("[EMAIL] SendGrid API contact email failed: %v — falling back to SMTP", err)
		} else {
			log.Printf("[EMAIL] Contact email sent via SendGrid API to: %s", to)
			return nil
		}
	}

	// 3. Fall back to SMTP.
	return s.sendSMTP(to, safeSubject, htmlBody, replyTo)
}

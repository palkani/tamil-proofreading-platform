package auth

import (
	"fmt"
	"log"
	"os"

	emailsvc "tamil-proofreading-platform/backend/internal/services/email"
)

// SendPasswordResetEmail sends a password reset email using the configured email service.
// Falls back to logging the link when no email provider is configured (useful for local dev).
func SendPasswordResetEmail(toEmail, rawToken string) error {
	frontendURL := os.Getenv("FRONTEND_URL")
	if frontendURL == "" {
		frontendURL = "https://www.prooftamil.com"
	}

	resetLink := fmt.Sprintf("%s/reset-password?token=%s", frontendURL, rawToken)

	svc := emailsvc.NewEmailService()

	if !svc.IsConfigured() {
		// No email provider configured — log the link so developers can test locally.
		log.Printf("[EMAIL] Email service not configured. Password reset link for %s: %s", toEmail, resetLink)
		return nil
	}

	subject := "Reset your ProofTamil password"
	htmlBody := fmt.Sprintf(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background-color: #f5f5f5;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">

    <div style="background: linear-gradient(135deg, #1e3a8a 0%%, #3b82f6 100%%); padding: 30px; text-align: center;">
      <h1 style="color: white; margin: 0; font-size: 28px;">தமிழ்</h1>
      <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 16px;">ProofTamil</p>
    </div>

    <div style="padding: 40px 30px;">
      <h2 style="color: #1f2937; margin: 0 0 20px 0; font-size: 24px;">Reset Your Password</h2>
      <p style="color: #4b5563; font-size: 16px; line-height: 1.6; margin: 0 0 25px 0;">
        You requested a password reset for your ProofTamil account.
        Click the button below to set a new password.
      </p>

      <div style="text-align: center; margin: 30px 0;">
        <a href="%s"
           style="display: inline-block; background: linear-gradient(135deg, #1e3a8a 0%%, #3b82f6 100%%); color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 16px; font-weight: 600;">
          Reset Password
        </a>
      </div>

      <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin: 25px 0 0 0;">
        Or copy and paste this link into your browser:<br>
        <a href="%s" style="color: #3b82f6; word-break: break-all;">%s</a>
      </p>

      <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin: 20px 0 0 0;">
        This link expires in <strong>1 hour</strong>.
        If you did not request a password reset, you can safely ignore this email — your password will not change.
      </p>
    </div>

    <div style="background-color: #f9fafb; padding: 20px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
      <p style="color: #9ca3af; font-size: 12px; margin: 0;">
        &copy; 2025 ProofTamil. AI-powered Tamil writing assistant.
      </p>
    </div>
  </div>
</body>
</html>`, resetLink, resetLink, resetLink)

	if err := svc.SendEmail(toEmail, subject, htmlBody); err != nil {
		log.Printf("[EMAIL] Failed to send password reset email to %s: %v", toEmail, err)
		return err
	}

	log.Printf("[EMAIL] Password reset email sent to: %s", toEmail)
	return nil
}

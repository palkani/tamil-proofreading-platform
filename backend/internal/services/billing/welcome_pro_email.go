package billing

import (
	"fmt"
	"html"
	"log"
	"strings"

	emailsvc "tamil-proofreading-platform/backend/internal/services/email"
)

// WelcomeProEmailData is the payload for the bilingual first-Pro welcome
// email. Keep it small — this is a warm, brand email, not a receipt.
// Transactional receipt data (amount, next billing date) already ships
// separately from the payment.succeeded webhook via receipt_email.go.
type WelcomeProEmailData struct {
	RecipientName string // may be empty; template handles both
	AppURL        string // e.g. "https://www.prooftamil.com" — defaults if empty
}

// SendProWelcomeEmail sends the bilingual Tamil-first / English-second
// welcome message to a user whose Pro subscription just activated for
// the first time. Called from handleDodoSubscriptionActive after the
// Pro flag is flipped. Non-fatal at the call site — a missed welcome
// is cosmetic, not a billing incident.
func SendProWelcomeEmail(toEmail string, data WelcomeProEmailData) error {
	appURL := strings.TrimRight(data.AppURL, "/")
	if appURL == "" {
		appURL = "https://www.prooftamil.com"
	}
	greetingName := strings.TrimSpace(data.RecipientName)

	svc := emailsvc.NewEmailService()
	if !svc.IsConfigured() {
		log.Printf("[EMAIL/WELCOME_PRO] Skipping welcome to %s — email service not configured", toEmail)
		return nil
	}

	subject := "Welcome to ProofTamil Pro! 🎉"
	body := renderWelcomeProHTML(html.EscapeString(greetingName), appURL)

	if err := svc.SendEmail(toEmail, subject, body); err != nil {
		return fmt.Errorf("welcome-pro email to %s: %w", toEmail, err)
	}
	log.Printf("[EMAIL/WELCOME_PRO] Sent to %s", toEmail)
	return nil
}

// renderWelcomeProHTML builds the actual HTML. Kept inline (not a template
// file) because the message is fixed copy and the styling has to be inline
// for email-client compatibility. Both Tamil and English versions live
// side by side; Tamil is presented first as a deliberate cultural signal
// that Tamil is the product's primary language, not a translated afterthought.
func renderWelcomeProHTML(escapedName string, appURL string) string {
	// Salutation: "அன்பான <name>" when we know the name, plain "அன்புடையீர்" otherwise.
	tamilSalutation := "அன்புடையீர்,"
	englishSalutation := "Hi,"
	if escapedName != "" {
		tamilSalutation = fmt.Sprintf("அன்பான %s,", escapedName)
		englishSalutation = fmt.Sprintf("Hi %s,", escapedName)
	}

	return fmt.Sprintf(`<!doctype html>
<html lang="ta">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Welcome to ProofTamil Pro</title>
</head>
<body style="margin:0;padding:0;background:#F5EDD7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',sans-serif;color:#171C2C;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%%" style="background:#F5EDD7;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%%;background:#FDF9EE;border-radius:16px;overflow:hidden;box-shadow:0 8px 24px -12px rgba(23,28,44,0.15);">

          <!-- Brand band -->
          <tr>
            <td style="padding:28px 32px 20px;text-align:center;background:linear-gradient(to bottom,#FFFEF7,rgba(253,249,238,0.6));border-bottom:1px solid #E4D7B8;">
              <div style="display:inline-flex;align-items:center;gap:10px;">
                <span style="display:inline-block;width:36px;height:36px;background:#171C2C;color:#F5A623;border-radius:8px;font-size:1.4rem;line-height:36px;text-align:center;font-family:'Noto Serif Tamil',serif;font-weight:700;vertical-align:middle;">த</span>
                <span style="font-family:'New York',ui-serif,Georgia,serif;font-size:1.15rem;font-weight:700;letter-spacing:-0.01em;vertical-align:middle;color:#171C2C;">ProofTamil</span>
              </div>
            </td>
          </tr>

          <!-- Headline -->
          <tr>
            <td style="padding:32px 40px 12px;text-align:center;">
              <div style="font-size:2rem;line-height:1;margin-bottom:8px;">🎉</div>
              <h1 style="margin:0;font-family:'New York',ui-serif,Georgia,serif;font-size:1.8rem;line-height:1.1;letter-spacing:-0.02em;color:#171C2C;">
                Welcome to ProofTamil Pro
              </h1>
              <p style="margin:12px 0 0;font-family:'Noto Serif Tamil','Latha',serif;font-size:1.1rem;line-height:1.3;color:#0E7C7B;">
                ProofTamil Pro-க்கு வரவேற்கிறோம்
              </p>
            </td>
          </tr>

          <!-- Tamil body -->
          <tr>
            <td style="padding:28px 40px 16px;font-family:'Noto Serif Tamil','Latha','InaiMathi',serif;font-size:1.02rem;line-height:1.7;color:#171C2C;">
              <p style="margin:0 0 16px;font-weight:600;">%s</p>
              <p style="margin:0 0 16px;">
                ProofTamil Pro-வைத் தேர்ந்தெடுத்து எங்களை ஆதரித்ததற்கு மனமார்ந்த நன்றி.
                எங்கள் வளர்ந்து வரும் தமிழ் சமூகத்தின் ஒரு பகுதியாக இணைந்திருப்பதில் மகிழ்ச்சி அடைகிறோம்.
              </p>
              <p style="margin:0 0 16px;">
                தமிழில் இன்னும் துல்லியமாகவும் நம்பிக்கையுடனும் எழுத உங்களுக்கு உதவுவதே எங்கள் நோக்கம்.
                இலக்கணச் சரிபார்ப்பு, குரலை தமிழாக மாற்றுதல், கைஎழுத்தை தமிழாக மாற்றுதல் போன்ற வசதிகள்
                உங்கள் தமிழ் எழுத்துப் பயணத்தை மேலும் எளிதாக்கும் என்று நம்புகிறோம்.
              </p>
              <p style="margin:0 0 16px;">
                ஏதேனும் கேள்விகள், கருத்துகள் அல்லது உதவி தேவைப்பட்டால், இந்த மின்னஞ்சலுக்கு பதிலளிக்கலாம்
                அல்லது <a href="mailto:contact@prooftamil.com" style="color:#E54B26;text-decoration:none;">contact@prooftamil.com</a>
                என்ற முகவரியில் எங்களை எப்போது வேண்டுமானாலும் தொடர்புகொள்ளலாம்.
                உங்களுக்கு உதவ எங்கள் குழு எப்போதும் மகிழ்ச்சியுடன் தயாராக உள்ளது.
              </p>
              <p style="margin:0 0 16px;">
                உங்கள் கருத்துகளும் ஆதரவும் ProofTamil-ஐ தொடர்ந்து மேம்படுத்த எங்களுக்கு மிகுந்த ஊக்கமாக இருக்கின்றன.
              </p>
              <p style="margin:0;">
                உங்கள் நம்பிக்கைக்கும் ஆதரவுக்கும் மீண்டும் ஒருமுறை மனமார்ந்த நன்றி.
                உங்கள் தமிழ் எழுத்துப் பயணத்தில் எப்போதும் உங்களுடன் இருப்பதில் மகிழ்ச்சி அடைகிறோம்.
              </p>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td style="padding:8px 40px 20px;text-align:center;">
              <a href="%s/workspace"
                 style="display:inline-block;background:#171C2C;color:#F5EDD7;padding:14px 28px;border-radius:10px;font-family:-apple-system,'Segoe UI',sans-serif;font-size:0.98rem;font-weight:500;text-decoration:none;box-shadow:0 6px 0 #E54B26;">
                Open Workspace →
              </a>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding:0 40px;">
              <div style="height:1px;background:linear-gradient(to right,#C99B4A 32%%,rgba(196,181,138,0.2) 32%%);opacity:0.6;"></div>
            </td>
          </tr>

          <!-- English body -->
          <tr>
            <td style="padding:24px 40px 12px;font-family:-apple-system,'Segoe UI',sans-serif;font-size:0.96rem;line-height:1.65;color:#171C2C;">
              <p style="margin:0 0 14px;font-weight:600;">%s</p>
              <p style="margin:0 0 14px;">
                Thank you for choosing ProofTamil Pro and becoming a part of our growing community.
                Your support means a great deal to us.
              </p>
              <p style="margin:0 0 14px;">
                We're excited to help you write better Tamil with confidence. Whether you're
                checking grammar, converting your voice to Tamil text, or using handwriting
                recognition, we hope ProofTamil becomes your trusted AI writing companion.
              </p>
              <p style="margin:0 0 14px;">
                If you have any questions, suggestions, or need assistance, we're always here to help.
                Simply reply to this email or contact us anytime at
                <a href="mailto:contact@prooftamil.com" style="color:#E54B26;text-decoration:none;">contact@prooftamil.com</a>.
                We'd be happy to assist you.
              </p>
              <p style="margin:0 0 14px;">
                Your feedback and support help us improve ProofTamil and build the best AI-powered
                writing assistant for Tamil.
              </p>
              <p style="margin:0;">
                Thank you once again for your trust and support. We look forward to being part of your
                Tamil writing journey.
              </p>
            </td>
          </tr>

          <!-- Invoice note -->
          <tr>
            <td style="padding:12px 40px 8px;">
              <div style="background:#F5EDD7;border:1px solid #E4D7B8;border-radius:10px;padding:14px 16px;font-family:-apple-system,'Segoe UI',sans-serif;font-size:0.84rem;color:#171C2C;">
                <div style="font-weight:600;margin-bottom:4px;">📄 Your invoice</div>
                <div style="line-height:1.55;color:rgba(23,28,44,0.75);">
                  Dodo Payments (our payment processor) will send you the official tax invoice separately.
                  You can also view all your invoices anytime at
                  <a href="%s/account/billing" style="color:#E54B26;text-decoration:none;">your billing page</a>.
                </div>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 32px 28px;text-align:center;font-family:-apple-system,'Segoe UI',sans-serif;font-size:0.78rem;color:rgba(23,28,44,0.55);">
              <div style="margin-bottom:6px;">— The ProofTamil team</div>
              <div>
                <a href="%s" style="color:rgba(23,28,44,0.55);text-decoration:none;">prooftamil.com</a>
                &nbsp;·&nbsp;
                <a href="mailto:contact@prooftamil.com" style="color:rgba(23,28,44,0.55);text-decoration:none;">contact@prooftamil.com</a>
              </div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`, tamilSalutation, appURL, englishSalutation, appURL, appURL)
}

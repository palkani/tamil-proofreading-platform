package billing

import (
	"fmt"
	"html"
	"strings"
)

// Bilingual Tamil-first drip templates for the abandoned-checkout
// sequence. Three touches at increasing distance from the abandoned
// checkout: warm nudge, social proof, final soft close.
//
// Style mirrors the Pro welcome email (welcome_pro_email.go): cream
// background (#F5EDD7), dark ink (#171C2C), Tamil-orange accent
// (#E54B26), Noto Serif Tamil for Tamil paragraphs. Both languages
// live in every email because we don't know which the reader prefers
// and switching by locale would double the maintenance surface.
//
// Every template ends with a small legal footer including the
// one-click unsubscribe URL. The URL carries a signed token so we
// can honor it without a login — see dunning_tokens.go.

// dripEmailData is the shared payload for all three drip templates.
type dripEmailData struct {
	RecipientName string // may be empty
	PlanName      string // "ProofTamil Pro" — pre-formatted
	ResumeURL     string // signed one-click resume link
	UnsubURL      string // signed one-click unsubscribe link
	AppURL        string // https://www.prooftamil.com
}

// dripSubjectAndBody returns the subject + full HTML for a given
// touch number (1, 2, 3). Touch 1 is warm, touch 2 is social proof,
// touch 3 is the final "no pressure" note.
func dripSubjectAndBody(touch int, d dripEmailData) (subject, body string) {
	switch touch {
	case 1:
		return dripTouch1(d)
	case 2:
		return dripTouch2(d)
	case 3:
		return dripTouch3(d)
	}
	// Shouldn't happen; caller controls the argument. Return a
	// safe empty pair rather than panic — a missed reminder is
	// less bad than a crashed cron loop.
	return "", ""
}

// dripTouch1 — 1 hour after abandonment. Warm, personal, low pressure.
// Assumes distraction, not disinterest. Leads with the resume CTA.
func dripTouch1(d dripEmailData) (string, string) {
	subject := "Your ProofTamil Pro upgrade is one click away"
	body := renderDripHTML(dripCopy{
		HeadlineEN: "You were so close.",
		HeadlineTA: "இன்னும் ஒரே ஒரு click மட்டும்தான்.",
		LeadTA:     fmt.Sprintf(`நீங்கள் <strong>%s</strong>-ஐ upgrade செய்யத் தொடங்கினீர்கள், ஆனால் முடிக்கவில்லை. Pro-வில் உங்களுக்காக காத்திருக்கும் features:`, html.EscapeString(d.PlanName)),
		LeadEN:     fmt.Sprintf(`You started upgrading to <strong>%s</strong> a little while ago but didn't finish. Here's what's waiting for you on the other side:`, html.EscapeString(d.PlanName)),
		BulletsEN: []string{
			"Unlimited word count on every proofread",
			"Priority AI processing — no queue at peak hours",
			"Full draft history + Tamil handwriting and voice input",
		},
		BulletsTA: []string{
			"ஒவ்வொரு proofread-க்கும் வார்த்தை வரம்பு இல்லை",
			"முன்னுரிமை AI processing — காத்திருப்பு இல்லை",
			"முழுமையான draft history + தமிழ் handwriting & voice input",
		},
		CTALabel:   "Resume checkout →",
		SignoffEN:  "Reply to this email if anything went wrong at checkout — we read every reply.",
		SignoffTA:  "Checkout-இல் ஏதேனும் சிக்கல் இருந்தால், இந்த email-க்கு reply செய்யுங்கள். நாங்கள் ஒவ்வொரு reply-யையும் படிக்கிறோம்.",
	}, d)
	return subject, body
}

// dripTouch2 — 24 hours after abandonment. Social proof forward.
// The user has now definitely seen touch 1 and chose not to act;
// this email adds the "others already trust us" signal.
func dripTouch2(d dripEmailData) (string, string) {
	subject := "Tamil writers are already using ProofTamil Pro daily"
	body := renderDripHTML(dripCopy{
		HeadlineEN: "You're not the only one thinking about it.",
		HeadlineTA: "நீங்கள் மட்டும் யோசிக்கவில்லை.",
		LeadTA:     `தினமும் நூற்றுக்கணக்கான தமிழ் எழுத்தாளர்கள் ProofTamil Pro-வை பயன்படுத்தி தங்கள் எழுத்தை மேலும் தெளிவாக்குகிறார்கள். Pro-வில் நீங்கள் பெறுவது:`,
		LeadEN:     `Hundreds of Tamil writers use ProofTamil Pro every day to make their writing clearer, faster. Here's what they get — and what's still waiting in your cart:`,
		BulletsEN: []string{
			"AI-powered grammar + style suggestions calibrated for Tamil, not translated from English models",
			"Priority queue — Pro requests get processed first, always",
			"Full draft version history — never lose a paragraph again",
			"Handwriting-to-Tamil and voice-to-Tamil input for authentic writing flow",
		},
		BulletsTA: []string{
			"தமிழுக்கே calibrate செய்யப்பட்ட AI grammar + style suggestions",
			"முன்னுரிமை queue — Pro requests எப்போதும் முதலில்",
			"முழு draft version history — ஒரு பத்தி கூட தொலைந்துபோகாது",
			"Handwriting-to-Tamil, voice-to-Tamil input — உங்கள் இயற்கை எழுத்து ஓட்டத்திற்கு",
		},
		CTALabel:  "Finish upgrading →",
		SignoffEN: "Questions about billing, features, or how Pro compares to Free? Just reply — no bots, we answer directly.",
		SignoffTA: "Billing, features, அல்லது Pro எப்படி Free-விடமிருந்து மாறுபடுகிறது என்பது பற்றி கேள்விகள் இருந்தால், reply செய்யுங்கள். நேரடியாக நாங்களே பதிலளிக்கிறோம்.",
	}, d)
	return subject, body
}

// dripTouch3 — 72 hours after abandonment. Final touch. Explicitly
// low pressure, includes a "we won't email you about this again"
// commitment so the user knows this is the last nudge. Preserves
// brand goodwill in the case they choose not to convert.
func dripTouch3(d dripEmailData) (string, string) {
	subject := "One last note about your ProofTamil Pro upgrade"
	body := renderDripHTML(dripCopy{
		HeadlineEN: "No pressure. Just leaving the door open.",
		HeadlineTA: "வற்புறுத்தல் இல்லை. கதவை மட்டும் திறந்து வைத்திருக்கிறோம்.",
		LeadTA:     `இது ProofTamil Pro பற்றிய கடைசி email. நீங்கள் நினைத்து முடிவெடுக்க நேரம் தேவைப்படலாம் என்பது எங்களுக்குப் புரிகிறது. Ready ஆனால், கீழே உள்ள link உங்களுக்காக காத்திருக்கிறது:`,
		LeadEN:     `This is the last email we'll send you about this checkout. We know these decisions take time. If you'd like to finish upgrading later, the link below will still work for the next two weeks:`,
		BulletsEN: []string{
			"No trial period trickery — full Pro access from the first minute",
			"Cancel anytime from your account page, one click, no forms",
			"Your existing drafts and settings stay exactly as they are",
		},
		BulletsTA: []string{
			"Trial period tricks இல்லை — முதல் நிமிடத்திலிருந்தே முழு Pro access",
			"எப்போது வேண்டுமானாலும் account page-இல் ஒரே click-இல் cancel செய்யலாம்",
			"உங்கள் existing drafts + settings எல்லாம் அப்படியே இருக்கும்",
		},
		CTALabel:  "Complete my upgrade →",
		SignoffEN: "If Pro isn't right for you right now, that's completely fine. You can always keep using ProofTamil on the Free plan. Thank you for giving us a look.",
		SignoffTA: "இப்போது Pro உங்களுக்குப் பொருந்தவில்லை என்றால், அதுவும் சரிதான். Free plan-இல் ProofTamil-ஐ தொடர்ந்து பயன்படுத்தலாம். எங்களை பரிசீலித்ததற்கு நன்றி.",
	}, d)
	return subject, body
}

// dripCopy is the per-touch copy that gets slotted into the shared
// HTML shell. Keeps the visual scaffolding in one place (renderDripHTML)
// while the words live per-touch.
type dripCopy struct {
	HeadlineEN string
	HeadlineTA string
	LeadTA     string
	LeadEN     string
	BulletsEN  []string
	BulletsTA  []string
	CTALabel   string
	SignoffEN  string
	SignoffTA  string
}

// renderDripHTML wraps per-touch copy in the shared cream-and-ink
// brand shell. The visual language deliberately matches
// welcome_pro_email.go so the whole lifecycle series looks like one
// coherent product.
func renderDripHTML(c dripCopy, d dripEmailData) string {
	appURL := strings.TrimRight(d.AppURL, "/")
	if appURL == "" {
		appURL = "https://www.prooftamil.com"
	}

	greetingName := strings.TrimSpace(d.RecipientName)
	tamilSalutation := "வணக்கம்,"
	englishSalutation := "Hi,"
	if greetingName != "" {
		esc := html.EscapeString(greetingName)
		tamilSalutation = fmt.Sprintf("வணக்கம் %s,", esc)
		englishSalutation = fmt.Sprintf("Hi %s,", esc)
	}

	bulletHTML := func(items []string, tamil bool) string {
		var b strings.Builder
		font := "-apple-system,'Segoe UI',sans-serif"
		if tamil {
			font = "'Noto Serif Tamil','Latha','InaiMathi',serif"
		}
		b.WriteString(`<ul style="margin:8px 0 16px 0;padding-left:20px;font-family:` + font + `;font-size:0.96rem;line-height:1.65;color:#171C2C;">`)
		for _, it := range items {
			b.WriteString(`<li style="margin:0 0 8px 0;">` + it + `</li>`)
		}
		b.WriteString(`</ul>`)
		return b.String()
	}

	return fmt.Sprintf(`<!doctype html>
<html lang="ta">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>%s</title>
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
              <h1 style="margin:0;font-family:'New York',ui-serif,Georgia,serif;font-size:1.6rem;line-height:1.15;letter-spacing:-0.02em;color:#171C2C;">
                %s
              </h1>
              <p style="margin:10px 0 0;font-family:'Noto Serif Tamil','Latha',serif;font-size:1.05rem;line-height:1.3;color:#0E7C7B;">
                %s
              </p>
            </td>
          </tr>

          <!-- Tamil body -->
          <tr>
            <td style="padding:24px 40px 4px;font-family:'Noto Serif Tamil','Latha','InaiMathi',serif;font-size:1.0rem;line-height:1.7;color:#171C2C;">
              <p style="margin:0 0 12px;font-weight:600;">%s</p>
              <p style="margin:0 0 8px;">%s</p>
              %s
            </td>
          </tr>

          <!-- Primary CTA -->
          <tr>
            <td style="padding:12px 40px 20px;text-align:center;">
              <a href="%s"
                 style="display:inline-block;background:#171C2C;color:#F5EDD7;padding:14px 32px;border-radius:10px;font-family:-apple-system,'Segoe UI',sans-serif;font-size:1.0rem;font-weight:600;text-decoration:none;box-shadow:0 6px 0 #E54B26;">
                %s
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
            <td style="padding:24px 40px 4px;font-family:-apple-system,'Segoe UI',sans-serif;font-size:0.96rem;line-height:1.65;color:#171C2C;">
              <p style="margin:0 0 12px;font-weight:600;">%s</p>
              <p style="margin:0 0 8px;">%s</p>
              %s
            </td>
          </tr>

          <!-- Signoff -->
          <tr>
            <td style="padding:12px 40px 8px;">
              <div style="background:#F5EDD7;border:1px solid #E4D7B8;border-radius:10px;padding:14px 16px;font-family:-apple-system,'Segoe UI',sans-serif;font-size:0.86rem;color:rgba(23,28,44,0.85);line-height:1.55;">
                <div style="margin-bottom:6px;">%s</div>
                <div style="font-family:'Noto Serif Tamil','Latha',serif;">%s</div>
              </div>
            </td>
          </tr>

          <!-- Footer with unsubscribe -->
          <tr>
            <td style="padding:20px 32px 28px;text-align:center;font-family:-apple-system,'Segoe UI',sans-serif;font-size:0.76rem;color:rgba(23,28,44,0.55);line-height:1.55;">
              <div style="margin-bottom:6px;">— The ProofTamil team</div>
              <div style="margin-bottom:10px;">
                <a href="%s" style="color:rgba(23,28,44,0.55);text-decoration:none;">prooftamil.com</a>
                &nbsp;·&nbsp;
                <a href="mailto:contact@prooftamil.com" style="color:rgba(23,28,44,0.55);text-decoration:none;">contact@prooftamil.com</a>
              </div>
              <div style="border-top:1px solid rgba(23,28,44,0.1);padding-top:10px;">
                You're getting this because you started a subscription flow at prooftamil.com.
                <br>
                <a href="%s" style="color:rgba(23,28,44,0.55);text-decoration:underline;">Unsubscribe from these emails</a>
              </div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
		html.EscapeString(c.HeadlineEN),
		html.EscapeString(c.HeadlineEN),
		html.EscapeString(c.HeadlineTA),
		tamilSalutation,
		c.LeadTA,
		bulletHTML(c.BulletsTA, true),
		html.EscapeString(d.ResumeURL),
		html.EscapeString(c.CTALabel),
		englishSalutation,
		c.LeadEN,
		bulletHTML(c.BulletsEN, false),
		html.EscapeString(c.SignoffEN),
		c.SignoffTA,
		appURL,
		html.EscapeString(d.UnsubURL),
	)
}

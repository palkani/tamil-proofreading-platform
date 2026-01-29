package main

import (
	"html"
	"regexp"
	"strings"
	"unicode"
)

// Result holds the spam check outcome and score.
type Result struct {
	IsSpam      bool     `json:"is_spam"`
	Score       float64  `json:"score"`        // 0–100, higher = more likely spam
	Confidence  string   `json:"confidence"`   // "low", "medium", "high"
	Reasons     []string `json:"reasons,omitempty"`
	Source      string   `json:"source,omitempty"`       // "heuristic" | "model" | "spamassassin" | "provider"
	ProviderErr string   `json:"provider_err,omitempty"`  // if provider/SA failed
}

// Check analyzes subject + body and returns a spam result.
func Check(subject, body string) Result {
	subject = strings.TrimSpace(subject)
	body = strings.TrimSpace(body)
	combined := subject + "\n" + body
	combinedLower := strings.ToLower(combined)

	var score float64
	var reasons []string

	// 1) Spam/urgent keyword density (weight: up to 35)
	spamKeywords := []string{
		"winner", "congratulations", "claim", "prize", "free", "urgent", "act now",
		"click here", "unsubscribe", "limited time", "offer expires", "buy now",
		"dear friend", "dear winner", "you have been selected", "nigerian prince",
		"wire transfer", "bank account", "password", "verify your account",
		"click below", "suspended", "account locked", "confirm your identity",
		"inheritance", "lottery", "cash bonus", "no obligation", "risk free",
		"viagra", "cialis", "pharmacy", "discount", "percent off", "%% off",
		"dollar", "million", "billion", "inheritance", "beneficiary",
	}
	keywordHits := 0
	for _, kw := range spamKeywords {
		if strings.Contains(combinedLower, kw) {
			keywordHits++
		}
	}
	if keywordHits > 0 {
		kwScore := float64(keywordHits) * 4
		if kwScore > 35 {
			kwScore = 35
		}
		score += kwScore
		reasons = append(reasons, "spam/urgent keywords detected")
	}

	// 2) Excessive caps (weight: up to 15)
	capsRatio := capsRatio(combined)
	if capsRatio > 0.5 {
		score += 15
		reasons = append(reasons, "high proportion of capital letters")
	} else if capsRatio > 0.3 {
		score += 8
		reasons = append(reasons, "elevated use of caps")
	}

	// 3) Link density (weight: up to 20)
	linkCount := countLinks(combined)
	wordCount := wordCount(combined)
	if wordCount > 0 {
		linksPer100Words := float64(linkCount) / float64(wordCount) * 100
		if linksPer100Words >= 10 {
			score += 20
			reasons = append(reasons, "very high link density")
		} else if linksPer100Words >= 5 {
			score += 12
			reasons = append(reasons, "high link density")
		} else if linksPer100Words >= 2 {
			score += 5
		}
	}

	// 4) Urgency / pressure phrases (weight: up to 15)
	urgencyPhrases := []string{
		"act now", "limited time", "expires soon", "don't miss", "last chance",
		"immediately", "as soon as possible", "urgent", "attention required",
		"verify now", "confirm now", "click now",
	}
	for _, p := range urgencyPhrases {
		if strings.Contains(combinedLower, p) {
			score += 5
			reasons = append(reasons, "urgency/pressure language")
			break
		}
	}

	// 5) Suspicious patterns: many numbers, dollar amounts (weight: up to 10)
	if regexp.MustCompile(`\$\s*\d+`).MatchString(combined) {
		if regexp.MustCompile(`\$\s*\d{1,3}(,\d{3})*(\.\d{2})?`).MatchString(combined) {
			score += 5
			reasons = append(reasons, "money amounts mentioned")
		}
	}
	digitRatio := digitRatio(combined)
	if digitRatio > 0.15 && wordCount > 20 {
		score += 5
		reasons = append(reasons, "unusual number density")
	}

	// 6) HTML-heavy / hidden text (weight: up to 10)
	plainLen := len(stripHTML(combined))
	totalLen := len(strings.TrimSpace(combined))
	if totalLen > 0 && plainLen < totalLen/2 {
		score += 10
		reasons = append(reasons, "content is mostly HTML/markup")
	}

	// 7) Very short body with strong subject (possible phishing)
	if len(body) < 50 && len(subject) > 20 && (strings.Contains(combinedLower, "click") || strings.Contains(combinedLower, "verify")) {
		score += 10
		reasons = append(reasons, "short body with action-oriented subject")
	}

	// 8) Excessive punctuation (!!!, ???)
	if regexp.MustCompile(`!{2,}|\?{2,}`).MatchString(combined) {
		score += 5
		reasons = append(reasons, "excessive punctuation")
	}

	// Cap total score at 100
	if score > 100 {
		score = 100
	}

	isSpam := score >= 50
	confidence := "low"
	if score >= 75 || score <= 25 {
		confidence = "high"
	} else if score >= 60 || score <= 40 {
		confidence = "medium"
	}

	return Result{
		IsSpam:     isSpam,
		Score:      round2(score),
		Confidence: confidence,
		Reasons:    reasons,
		Source:     "heuristic",
	}
}

// CheckFull runs all enabled backends (provider -> SpamAssassin -> model -> heuristic) and merges.
func CheckFull(subject, body string) Result {
	subject = strings.TrimSpace(subject)
	body = strings.TrimSpace(body)

	// 1) External provider API (highest priority if configured and successful)
	if providerEnabled {
		if pr, ok := CheckProvider(subject, body); ok && pr.Error == "" {
			conf := "medium"
			if pr.Score >= 75 || pr.Score <= 25 {
				conf = "high"
			}
			return Result{
				IsSpam:     pr.IsSpam,
				Score:      pr.Score,
				Confidence: conf,
				Source:     "provider",
			}
		}
	}

	// 2) SpamAssassin (if spamc/spamd configured)
	if saEnabled {
		if sa, ok := CheckSpamAssassin(subject, body); ok && sa.Error == "" {
			// Map SA score (-20..20) to 0..100: 5 -> 50, 10 -> 75, 0 -> 25, -5 -> 12
			score := saScoreTo100(sa.Score)
			conf := "medium"
			if score >= 75 || score <= 25 {
				conf = "high"
			}
			return Result{
				IsSpam:     sa.IsSpam,
				Score:      round2(score),
				Confidence: conf,
				Reasons:    sa.Details,
				Source:     "spamassassin",
			}
		}
	}

	// 3) Trained Naive Bayes model
	if pSpam := CheckWithModel(subject, body); pSpam >= 0 {
		score := pSpam * 100
		conf := "low"
		if score >= 75 || score <= 25 {
			conf = "high"
		} else if score >= 60 || score <= 40 {
			conf = "medium"
		}
		return Result{
			IsSpam:     score >= 50,
			Score:      round2(score),
			Confidence: conf,
			Source:     "model",
		}
	}

	// 4) Heuristic fallback
	return Check(subject, body)
}

// saScoreTo100 maps SpamAssassin score (typical -20..20) to 0..100.
func saScoreTo100(saScore float64) float64 {
	// 0 -> 25, 5 -> 50, 10 -> 75, 15+ -> 95; negative -> lower
	if saScore <= -5 {
		return 5
	}
	if saScore >= 15 {
		return 95
	}
	// linear: 5 -> 50, 10 -> 75
	score := 25 + saScore*5
	if score < 0 {
		score = 0
	}
	if score > 100 {
		score = 100
	}
	return score
}

func capsRatio(s string) float64 {
	var caps, letters int
	for _, r := range s {
		if unicode.IsLetter(r) {
			letters++
			if unicode.IsUpper(r) {
				caps++
			}
		}
	}
	if letters == 0 {
		return 0
	}
	return float64(caps) / float64(letters)
}

func countLinks(s string) int {
	// Match http(s) and common link patterns
	re := regexp.MustCompile(`https?://[^\s<>"']+|www\.[^\s<>"']+`)
	return len(re.FindAllString(s, -1))
}

func wordCount(s string) int {
	return len(strings.Fields(stripHTML(s)))
}

func digitRatio(s string) float64 {
	var digits, total int
	for _, r := range s {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			total++
			if unicode.IsDigit(r) {
				digits++
			}
		}
	}
	if total == 0 {
		return 0
	}
	return float64(digits) / float64(total)
}

func stripHTML(s string) string {
	// Remove tags
	tagRe := regexp.MustCompile(`<[^>]*>`)
	s = tagRe.ReplaceAllString(s, " ")
	s = html.UnescapeString(s)
	return strings.Join(strings.Fields(s), " ")
}

func round2(x float64) float64 {
	return float64(int(x*100+0.5)) / 100
}

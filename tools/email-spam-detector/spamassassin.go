package main

import (
	"bufio"
	"fmt"
	"net"
	"os/exec"
	"regexp"
	"strings"
	"time"
)

// SpamAssassinResult holds the SA check outcome.
type SpamAssassinResult struct {
	Score   float64  `json:"score"`   // SA score (typically -20..20)
	IsSpam  bool     `json:"is_spam"`  // score >= threshold
	Details []string `json:"details,omitempty"`
	Error   string   `json:"error,omitempty"`
}

const (
	// DefaultSpamThreshold is SpamAssassin's typical threshold (5.0).
	DefaultSpamThreshold = 5.0
	spamcTimeout         = 10 * time.Second
	spamdTimeout         = 5 * time.Second
)

var (
	spamcPath     string
	spamdAddr     string // e.g. "127.0.0.1:783" or "" to use spamc
	saEnabled     bool
	saThreshold   = DefaultSpamThreshold
)

// ConfigureSpamAssassin sets the path to spamc and/or spamd address.
// If spamdAddr is non-empty, we use TCP to spamd; otherwise we run spamc.
func ConfigureSpamAssassin(path string, addr string, threshold float64) {
	spamcPath = path
	spamdAddr = strings.TrimSpace(addr)
	if threshold > 0 {
		saThreshold = threshold
	}
	saEnabled = path != "" || spamdAddr != ""
}

// CheckSpamAssassin runs the email through SpamAssassin (spamc or spamd) and returns the result.
func CheckSpamAssassin(subject, body string) (SpamAssassinResult, bool) {
	if !saEnabled {
		return SpamAssassinResult{}, false
	}
	if spamdAddr != "" {
		return checkSpamd(subject, body)
	}
	return checkSpamc(subject, body)
}

// buildRFC822 builds a minimal RFC 822-style message for SA.
func buildRFC822(subject, body string) string {
	var b strings.Builder
	b.WriteString("Subject: ")
	b.WriteString(subject)
	b.WriteString("\r\n")
	b.WriteString("Content-Type: text/plain; charset=utf-8\r\n")
	b.WriteString("\r\n")
	b.WriteString(body)
	b.WriteString("\r\n")
	return b.String()
}

func checkSpamc(subject, body string) (SpamAssassinResult, bool) {
	msg := buildRFC822(subject, body)
	cmd := exec.Command(spamcPath, "-c") // -c: use stdin
	cmd.Stdin = strings.NewReader(msg)
	out, err := cmd.Output()
	if err != nil {
		return SpamAssassinResult{Error: err.Error()}, true
	}
	return parseSpamAssassinOutput(string(out)), true
}

func checkSpamd(subject, body string) (SpamAssassinResult, bool) {
	msg := buildRFC822(subject, body)
	conn, err := net.DialTimeout("tcp", spamdAddr, spamdTimeout)
	if err != nil {
		return SpamAssassinResult{Error: err.Error()}, true
	}
	defer conn.Close()
	_ = conn.SetDeadline(time.Now().Add(spamdTimeout))

	// Spamd protocol: send "PROCESS SPAMC/1.2\r\nContent-Length: %d\r\n\r\n" + body
	header := fmt.Sprintf("PROCESS SPAMC/1.2\r\nContent-Length: %d\r\n\r\n", len(msg))
	if _, err := conn.Write([]byte(header + msg)); err != nil {
		return SpamAssassinResult{Error: err.Error()}, true
	}
	scanner := bufio.NewScanner(conn)
	var lines []string
	for scanner.Scan() {
		lines = append(lines, scanner.Text())
	}
	if err := scanner.Err(); err != nil {
		return SpamAssassinResult{Error: err.Error()}, true
	}
	return parseSpamAssassinOutput(strings.Join(lines, "\n")), true
}

// parseSpamAssassinOutput parses spamc/spamd output for X-Spam-Score and X-Spam-Flag.
func parseSpamAssassinOutput(out string) SpamAssassinResult {
	var score float64
	var isSpam bool
	var details []string
	scoreRe := regexp.MustCompile(`(?i)X-Spam-Score:\s*([\d.-]+)`)
	flagRe := regexp.MustCompile(`(?i)X-Spam-Flag:\s*(Yes|No)`)
	reportRe := regexp.MustCompile(`(?i)X-Spam-Report:?\s*(.*)`)

	lines := strings.Split(out, "\n")
	for _, line := range lines {
		if m := scoreRe.FindStringSubmatch(line); len(m) > 1 {
			_, _ = fmt.Sscanf(m[1], "%f", &score)
		}
		if m := flagRe.FindStringSubmatch(line); len(m) > 1 {
			isSpam = strings.EqualFold(m[1], "Yes")
		}
		if m := reportRe.FindStringSubmatch(line); len(m) > 1 {
			// Report can contain rules; optionally parse
			details = append(details, strings.TrimSpace(m[1]))
		}
	}
	// If no flag, use threshold
	if !flagRe.MatchString(out) {
		isSpam = score >= saThreshold
	}
	return SpamAssassinResult{
		Score:   score,
		IsSpam:  isSpam,
		Details: details,
	}
}

package billing

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

// Signed tokens embedded in drip emails so their CTA links (resume
// checkout, unsubscribe) authenticate the user without a login. The
// tokens are HMAC-SHA256-signed with the app's JWT_SECRET so we don't
// need a new operator-managed secret. Format is intentionally
// human-inspectable in logs: purpose|userID|planCode|expiresUnix|hex(sig).
//
// Two purposes exist today: "resume" (rehydrate a Dodo checkout
// session) and "unsub" (set marketing_unsubscribed_at). Purposes
// participate in the signature, so a resume token cannot be replayed
// against the unsubscribe endpoint or vice-versa.
//
// Expiry: resume tokens live 14 days (Dodo payment links usually
// expire sooner but we let the server re-create a fresh Dodo session
// on click, so as long as the user clicks within our window it works).
// Unsubscribe tokens live 1 year — some users only find the drip
// email in their promotions folder months later, and we want the
// unsub link to still work.

const (
	dunningPurposeResume = "resume"
	dunningPurposeUnsub  = "unsub"
)

// ResumeTokenTTL is the validity window for a checkout-resume link.
// After this, the user must go back to /pricing and re-initiate
// checkout manually — no data loss, just a login-and-click again.
const ResumeTokenTTL = 14 * 24 * time.Hour

// UnsubTokenTTL is long by design; unsubscribe should never 404 the
// user just because they took a while to open the email.
const UnsubTokenTTL = 365 * 24 * time.Hour

// MakeResumeToken builds a signed one-click resume-checkout token
// that binds a specific user + plan for a fixed window.
func MakeResumeToken(userID uint, planCode string) string {
	return makeDunningToken(dunningPurposeResume, userID, planCode, time.Now().Add(ResumeTokenTTL))
}

// MakeUnsubToken builds a signed one-click unsubscribe token. The
// plan code is empty; only the user identity matters for unsub.
func MakeUnsubToken(userID uint) string {
	return makeDunningToken(dunningPurposeUnsub, userID, "", time.Now().Add(UnsubTokenTTL))
}

// VerifyResumeToken parses and verifies a resume token, returning the
// user_id and plan_code the sender intended. Errors are deliberately
// vague ("invalid token") so we don't leak whether it was a bad
// signature, expired, or a different purpose.
func VerifyResumeToken(token string) (uint, string, error) {
	p, uid, plan, err := verifyDunningToken(token)
	if err != nil {
		return 0, "", err
	}
	if p != dunningPurposeResume {
		return 0, "", errors.New("invalid token")
	}
	return uid, plan, nil
}

// VerifyUnsubToken parses and verifies an unsubscribe token.
func VerifyUnsubToken(token string) (uint, error) {
	p, uid, _, err := verifyDunningToken(token)
	if err != nil {
		return 0, err
	}
	if p != dunningPurposeUnsub {
		return 0, errors.New("invalid token")
	}
	return uid, nil
}

// makeDunningToken is the shared token constructor. Layout of the
// signed payload before base64url encoding:
//
//	purpose | userID | planCode | expiresUnix | hex-hmac
//
// The pipe delimiter is safe because none of the individual fields
// can contain one: purpose is a fixed constant, userID and expiresUnix
// are integers, planCode is uppercase ASCII from our seed list.
func makeDunningToken(purpose string, userID uint, planCode string, expiresAt time.Time) string {
	payload := fmt.Sprintf("%s|%d|%s|%d", purpose, userID, planCode, expiresAt.Unix())
	sig := hmacHex(dunningSecret(), payload)
	full := payload + "|" + sig
	return base64.RawURLEncoding.EncodeToString([]byte(full))
}

// verifyDunningToken parses, validates the signature, and checks
// expiry. Returns purpose, user_id, plan_code (or empty).
func verifyDunningToken(token string) (string, uint, string, error) {
	if strings.TrimSpace(token) == "" {
		return "", 0, "", errors.New("invalid token")
	}
	raw, err := base64.RawURLEncoding.DecodeString(token)
	if err != nil {
		return "", 0, "", errors.New("invalid token")
	}
	parts := strings.Split(string(raw), "|")
	if len(parts) != 5 {
		return "", 0, "", errors.New("invalid token")
	}
	purpose := parts[0]
	uidStr := parts[1]
	planCode := parts[2]
	expStr := parts[3]
	gotSig := parts[4]

	uid, err := strconv.ParseUint(uidStr, 10, 32)
	if err != nil || uid == 0 {
		return "", 0, "", errors.New("invalid token")
	}
	expUnix, err := strconv.ParseInt(expStr, 10, 64)
	if err != nil {
		return "", 0, "", errors.New("invalid token")
	}

	// Signature check first — constant-time compare so an attacker
	// can't distinguish "wrong signature" from "wrong purpose" by
	// timing side-channel.
	wantSig := hmacHex(dunningSecret(), fmt.Sprintf("%s|%s|%s|%s", purpose, uidStr, planCode, expStr))
	if !hmac.Equal([]byte(gotSig), []byte(wantSig)) {
		return "", 0, "", errors.New("invalid token")
	}

	// Expiry check after sig — no point revealing "expired" if the
	// signature is forged.
	if time.Now().Unix() > expUnix {
		return "", 0, "", errors.New("invalid token")
	}

	return purpose, uint(uid), planCode, nil
}

func hmacHex(key, data string) string {
	h := hmac.New(sha256.New, []byte(key))
	h.Write([]byte(data))
	return hex.EncodeToString(h.Sum(nil))
}

// dunningSecret returns the HMAC key. We piggyback on JWT_SECRET
// (with a purpose-namespaced prefix) so operators don't need to
// manage another env var. If JWT_SECRET is unset — a misconfig — we
// fall back to a fixed dev value; production deploys should always
// have JWT_SECRET set.
func dunningSecret() string {
	base := os.Getenv("JWT_SECRET")
	if strings.TrimSpace(base) == "" {
		base = "dev-only-dunning-secret-do-not-use-in-prod"
	}
	return "dunning:" + base
}

package suggest

import (
	"strings"
	"unicode"
)

type NormalizeOptions struct {
	EnableVowelCollapse bool
}

// NormalizeRoman normalizes English/Thanglish input for trie lookup.
// Rules:
// - lowercase + trim
// - keep only a-z
// - apply zh→l, dh→t, th→t (common Tamil IME simplifications)
// - optional vowel collapse (aa→a, ee→i, oo→u)
func NormalizeRoman(q string, opts NormalizeOptions) string {
	s := strings.ToLower(strings.TrimSpace(q))
	if s == "" {
		return ""
	}
	var b strings.Builder
	b.Grow(len(s))
	for _, r := range s {
		if r >= 'a' && r <= 'z' {
			b.WriteRune(r)
			continue
		}
		if unicode.IsLetter(r) && r <= unicode.MaxASCII {
			// ignore non a-z letters
			continue
		}
	}
	out := b.String()
	if out == "" {
		return ""
	}

	// Canonical mappings - order matters (longer patterns first)
	out = strings.ReplaceAll(out, "zh", "l")  // ழ → l
	out = strings.ReplaceAll(out, "dh", "t")  // த/ட → t
	out = strings.ReplaceAll(out, "th", "t")  // த/ட → t
	out = strings.ReplaceAll(out, "gh", "k")  // க → k
	out = strings.ReplaceAll(out, "kh", "k")  // க → k
	out = strings.ReplaceAll(out, "bh", "p")  // ப → p
	out = strings.ReplaceAll(out, "ph", "p")  // ப → p
	out = strings.ReplaceAll(out, "ch", "c")  // ச → c
	out = strings.ReplaceAll(out, "sh", "c")  // ஷ/ச → c (common variation)

	// Tamil has no voiced/unvoiced distinction in many positions
	// Map voiced consonants to their unvoiced equivalents
	out = strings.ReplaceAll(out, "d", "t")   // ட/த → t
	out = strings.ReplaceAll(out, "g", "k")   // க → k  
	out = strings.ReplaceAll(out, "b", "p")   // ப → p
	out = strings.ReplaceAll(out, "j", "c")   // ஜ/ச → c

	if opts.EnableVowelCollapse {
		out = collapseVowels(out)
	}

	return out
}

func collapseVowels(s string) string {
	// aa->a, ee->i, oo->u (simple collapse)
	s = strings.ReplaceAll(s, "aa", "a")
	s = strings.ReplaceAll(s, "ee", "i")
	s = strings.ReplaceAll(s, "oo", "u")
	return s
}

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

	// Canonical mappings
	out = strings.ReplaceAll(out, "zh", "l")
	out = strings.ReplaceAll(out, "dh", "t")
	out = strings.ReplaceAll(out, "th", "t")

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

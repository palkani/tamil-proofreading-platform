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
// - apply multi-char mappings first: zh→l, dh→t, th→t (common Tamil IME simplifications)
// - normalize common consonant variations: d→t, b→p, g→k, etc. (handles natakam/nadagam, etc.)
// - optional vowel collapse (aa→a, ee→i, oo→u)
//
// This normalization ensures that common transliteration variations (like "nadagam" vs "natakam")
// map to the same canonical form, enabling fuzzy matching without requiring alternate spellings
// in the database for every word.
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

	// Step 1: Multi-character mappings (must come before single-char to avoid conflicts)
	// These are Tamil-specific: zh (ழ), dh (த), th (த)
	out = strings.ReplaceAll(out, "zh", "l")
	out = strings.ReplaceAll(out, "dh", "t")
	out = strings.ReplaceAll(out, "th", "t")

	// Step 2: Normalize common consonant variations to canonical forms
	// This handles cases like: natakam/nadagam, tamizh/damizh, etc.
	// We normalize to the "harder" consonant (t, p, k) as canonical
	out = normalizeConsonants(out)

	if opts.EnableVowelCollapse {
		out = collapseVowels(out)
	}

	return out
}

// normalizeConsonants normalizes common Tamil transliteration consonant variations.
// Maps interchangeable consonants to a canonical form:
//   - d → t (ட and த are often typed interchangeably: natakam/nadagam)
//   - b → p (ப variations)
//   - g → k (க variations)
//   - j → c (ச/ஜ variations)
//   - s → c (ச/ஸ variations, but preserve 'sh' which is distinct: ஷ)
//   - z → c (when standalone, zh was already normalized to l)
//
// This enables fuzzy matching: "nadagam" and "natakam" both normalize to "natakam"
// Note: Multi-char sequences (th, dh, zh) are normalized BEFORE this function is called.
func normalizeConsonants(s string) string {
	var b strings.Builder
	b.Grow(len(s))
	runes := []rune(s)
	
	for i := 0; i < len(runes); i++ {
		r := runes[i]
		
		switch r {
		case 'd':
			// Normalize d → t (handles natakam/nadagam, tamizh/damizh)
			// Note: "dh" was already normalized to "t" in the previous step
			b.WriteRune('t')
		case 'b':
			// Normalize b → p (ப variations)
			b.WriteRune('p')
		case 'g':
			// Normalize g → k (க variations: kovil/govil)
			b.WriteRune('k')
		case 'j':
			// Normalize j → c (ச/ஜ variations)
			b.WriteRune('c')
		case 's':
			// Normalize s → c (ச/ஸ variations)
			// But preserve 'sh' sequences (distinct sound: ஷ)
			if i+1 < len(runes) && runes[i+1] == 'h' {
				// Keep 'sh' as-is
				b.WriteRune('s')
			} else {
				b.WriteRune('c')
			}
		case 'z':
			// Normalize z → c (when standalone)
			// Note: "zh" was already normalized to "l" in the previous step
			b.WriteRune('c')
		default:
			b.WriteRune(r)
		}
	}
	
	return b.String()
}

func collapseVowels(s string) string {
	// aa->a, ee->i, oo->u (simple collapse)
	s = strings.ReplaceAll(s, "aa", "a")
	s = strings.ReplaceAll(s, "ee", "i")
	s = strings.ReplaceAll(s, "oo", "u")
	return s
}

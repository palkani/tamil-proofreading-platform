package suggest

import "testing"

func TestNormalizeRoman(t *testing.T) {
	opts := NormalizeOptions{EnableVowelCollapse: true}
	cases := map[string]string{
		// Original tests
		" Thamizh ": "tamil",
		"zh":        "l",
		"dh":        "t",
		"th":        "t",
		"vaaaan":    "vaan",
		"EE":        "i",
		"oo":        "u",
		"taMIL":     "tamil",
		"naanum":    "nanum", // aa→a with vowel collapse
		
		// New tests for consonant normalization
		"nadagam":   "natakam", // d→t, g→k: handles natakam/nadagam variation
		"natakam":   "natakam", // already canonical
		"damizh":    "tamil",   // d→t: handles tamizh/damizh variation
		"tamizh":    "tamil",   // already normalized (th→t, zh→l)
		"thamizh":   "tamil",   // th→t, zh→l
		"govil":     "kovil",   // g→k: handles kovil/govil variation
		"kovil":     "kovil",   // already canonical
		"batam":     "patam",   // b→p
		"patam":     "patam",   // already canonical
		"sari":      "cari",    // s→c
		"cari":      "cari",    // already canonical
		"jari":      "cari",    // j→c
		"shari":     "shari",   // preserve 'sh' (distinct sound)
		"zari":      "cari",    // z→c (when not zh)
	}
	for in, want := range cases {
		got := NormalizeRoman(in, opts)
		if got != want {
			t.Errorf("normalize %q => %q, want %q", in, got, want)
		}
	}
}

func TestNormalizeRomanWithoutVowelCollapse(t *testing.T) {
	opts := NormalizeOptions{EnableVowelCollapse: false}
	cases := map[string]string{
		"nadagam": "natakam", // d→t, g→k
		"aa":      "aa",       // vowels not collapsed
		"ee":      "ee",       // vowels not collapsed
	}
	for in, want := range cases {
		got := NormalizeRoman(in, opts)
		if got != want {
			t.Errorf("normalize %q => %q, want %q", in, got, want)
		}
	}
}

package suggest

import "testing"

func TestNormalizeRoman(t *testing.T) {
	opts := NormalizeOptions{EnableVowelCollapse: true}
	cases := map[string]string{
		" Thamizh ": "tamil",
		"zh":        "l",
		"dh":        "t",
		"th":        "t",
		"vaaaan":    "vaan",
		"EE":        "i",
		"oo":        "u",
		"taMIL":     "tamil",
		"naanum":    "nanum",
		// Tamil consonant voicing normalization
		"nadagam":   "natakam",  // d→t, g→k
		"padagu":    "pataku",   // d→t, g→k
		"bagam":     "pakam",    // b→p, g→k
		"jalam":     "calam",    // j→c
		"shiva":     "civa",     // sh→c
		"krishna":   "kricna",   // sh→c
		"bharat":    "parat",    // bh→p
		"gandhi":    "kanti",    // g→k, dh→t
	}
	for in, want := range cases {
		got := NormalizeRoman(in, opts)
		if got != want {
			t.Errorf("normalize %q => %q, want %q", in, got, want)
		}
	}
}

func TestNormalizeRomanNoVowelCollapse(t *testing.T) {
	opts := NormalizeOptions{EnableVowelCollapse: false}
	cases := map[string]string{
		"naanum":  "naanum",  // no vowel collapse, aa stays aa
		"vaaaan":  "vaaaan",  // no vowel collapse
		"thamizh": "tamil",   // zh→l, th→t still apply
		"nadagam": "natakam", // consonant normalization still applies
	}
	for in, want := range cases {
		got := NormalizeRoman(in, opts)
		if got != want {
			t.Errorf("normalize (no vowel collapse) %q => %q, want %q", in, got, want)
		}
	}
}

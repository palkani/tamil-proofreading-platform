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
		"naanum":    "naanum",
	}
	for in, want := range cases {
		got := NormalizeRoman(in, opts)
		if got != want {
			t.Fatalf("normalize %q => %q, want %q", in, got, want)
		}
	}
}

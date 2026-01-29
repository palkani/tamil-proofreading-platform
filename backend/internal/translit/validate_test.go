package translit

import (
	"testing"
)

func TestIsValidTamilWord(t *testing.T) {
	tests := []struct {
		name string
		s    string
		want bool
	}{
		{"empty", "", false},
		{"space only", "   ", false},
		{"valid Tamil", "தமிழ்", true},
		{"valid Tamil word", "என்ன", true},
		{"Latin leakage", "தamil", false},
		{"ASCII only", "friend", false},
		{"mixed", "தfriend", false},
		{"Tamil with space", "தமிழ் மொழி", true},
		{"single Tamil", "ஆ", true},
		{"virama", "க்", true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := IsValidTamilWord(tt.s); got != tt.want {
				t.Errorf("IsValidTamilWord(%q) = %v, want %v", tt.s, got, tt.want)
			}
		})
	}
}

func TestIsValidSuggestion(t *testing.T) {
	tests := []struct {
		name string
		s    Suggestion
		want bool
	}{
		{"valid", Suggestion{Word: "தமிழ்", Score: 0.9}, true},
		{"empty word", Suggestion{Word: "", Score: 1.0}, false},
		{"Latin word", Suggestion{Word: "tamil", Score: 1.0}, false},
		{"negative score", Suggestion{Word: "தமிழ்", Score: -0.1}, false},
		{"over max score", Suggestion{Word: "தமிழ்", Score: 11}, false},
		{"zero score ok", Suggestion{Word: "என்ன", Score: 0}, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := IsValidSuggestion(tt.s); got != tt.want {
				t.Errorf("IsValidSuggestion(%+v) = %v, want %v", tt.s, got, tt.want)
			}
		})
	}
}

func TestValidateSuggestions(t *testing.T) {
	in := []Suggestion{
		{Word: "தமிழ்", Score: 1.0},
		{Word: "invalid", Score: 0.8},
		{Word: "என்ன", Score: 0.7},
		{Word: "தமிழ்", Score: 0.6},
		{Word: "", Score: 0.5},
	}
	out := ValidateSuggestions(in)
	if len(out) != 2 {
		t.Errorf("ValidateSuggestions: got %d items, want 2 (valid + deduped)", len(out))
	}
	for _, s := range out {
		if !IsValidTamilWord(s.Word) {
			t.Errorf("ValidateSuggestions left invalid word %q", s.Word)
		}
	}
}

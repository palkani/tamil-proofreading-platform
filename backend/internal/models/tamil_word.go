package models

import (
        "time"

        "gorm.io/gorm"
)

type WordCategory string

const (
        CategoryCommon      WordCategory = "common"
        CategoryVerb        WordCategory = "verb"
        CategoryNoun        WordCategory = "noun"
        CategoryAdjective   WordCategory = "adjective"
        CategoryPronoun     WordCategory = "pronoun"
        CategoryAdverb      WordCategory = "adverb"
        CategoryPreposition WordCategory = "preposition"
        CategoryConjunction WordCategory = "conjunction"
        CategoryInterjection WordCategory = "interjection"
        CategoryProperNoun  WordCategory = "proper_noun"
        CategoryPhrase      WordCategory = "phrase"
)

type TamilWord struct {
        ID             uint         `gorm:"primaryKey" json:"id"`
        TamilText      string       `gorm:"size:255;not null;index:idx_tamil_text" json:"tamil_text"`
        Transliteration string      `gorm:"size:255;not null;uniqueIndex:idx_transliteration_unique" json:"transliteration"`
        AlternateSpellings string   `gorm:"type:text" json:"alternate_spellings,omitempty"` // JSON array of alternate transliterations
        Frequency      int          `gorm:"default:0;index:idx_frequency" json:"frequency"` // Higher = more common
        Category       WordCategory `gorm:"default:'common';index:idx_category" json:"category"`
        Meaning        string       `gorm:"type:text" json:"meaning,omitempty"` // English meaning
        Example        string       `gorm:"type:text" json:"example,omitempty"` // Example usage in Tamil
        IsVerified     bool         `gorm:"default:false;index:idx_verified" json:"is_verified"` // Human-verified vs AI-generated
        Source         string       `gorm:"size:100" json:"source,omitempty"` // e.g., "manual", "wiktionary", "ai_gemini", "user_confirmed"
        UserConfirmed  int          `gorm:"default:0" json:"user_confirmed"` // How many times users selected this transliteration
        CreatedAt      time.Time    `json:"created_at"`
        UpdatedAt      time.Time    `json:"updated_at"`
        DeletedAt      gorm.DeletedAt `gorm:"index" json:"-"`
}

// TableName specifies the table name for GORM
func (TamilWord) TableName() string {
        return "tamil_words"
}

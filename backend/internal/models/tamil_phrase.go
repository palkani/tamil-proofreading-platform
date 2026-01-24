package models

import "time"

// TamilPhrase stores high-signal phrases used for IME suggestions.
// Kept separate from TamilWord so we can independently tune loading + ranking.
type TamilPhrase struct {
	Phrase    string    `gorm:"type:text;primaryKey" json:"phrase"`
	Frequency int64     `gorm:"not null;default:0;index:idx_tamil_phrases_frequency" json:"frequency"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

func (TamilPhrase) TableName() string {
	return "tamil_phrases"
}



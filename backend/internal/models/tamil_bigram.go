package models

import "time"

// TamilBigram stores next-word frequency for basic context boosting.
type TamilBigram struct {
	Word      string    `gorm:"type:text;primaryKey" json:"word"`
	NextWord  string    `gorm:"type:text;primaryKey" json:"next_word"`
	Frequency int64     `gorm:"not null;default:0;index:idx_tamil_bigrams_frequency" json:"frequency"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

func (TamilBigram) TableName() string {
	return "tamil_bigrams"
}



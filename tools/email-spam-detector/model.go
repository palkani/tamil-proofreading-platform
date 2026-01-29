package main

import (
	"encoding/json"
	"math"
	"os"
	"regexp"
	"strings"
	"sync"
)

// NBModel is a Naive Bayes model for spam/ham classification.
type NBModel struct {
	PriorSpam float64            `json:"prior_spam"`
	PriorHam  float64            `json:"prior_ham"`
	SpamCount map[string]float64 `json:"spam_count"` // token -> count in spam
	HamCount  map[string]float64 `json:"ham_count"`  // token -> count in ham
	SpamTotal float64            `json:"spam_total"` // total token count in spam
	HamTotal  float64            `json:"ham_total"`
	VocabSize int                `json:"vocab_size"`
}

var (
	loadedModel   *NBModel
	modelPath     string
	modelLoadOnce sync.Once
)

const smoothing = 1.0 // Laplace smoothing

// tokenize normalizes and splits text into tokens (words, lowercase, no punctuation).
func tokenize(s string) []string {
	s = strings.ToLower(s)
	// Keep only letters and digits, split on non-word
	re := regexp.MustCompile(`[a-z0-9]+`)
	return re.FindAllString(s, -1)
}

// TrainNB trains a Naive Bayes model from labeled examples. label: "spam" or "ham".
func TrainNB(examples []LabeledEmail) *NBModel {
	spamCount := make(map[string]float64)
	hamCount := make(map[string]float64)
	var spamTotal, hamTotal float64
	var spamDocs, hamDocs int

	for _, ex := range examples {
		text := ex.Subject + " " + ex.Body
		tokens := tokenize(text)
		isSpam := strings.ToLower(strings.TrimSpace(ex.Label)) == "spam"
		for _, t := range tokens {
			if len(t) < 2 {
				continue
			}
			if isSpam {
				spamCount[t]++
				spamTotal++
			} else {
				hamCount[t]++
				hamTotal++
			}
		}
		if isSpam {
			spamDocs++
		} else {
			hamDocs++
		}
	}
	totalDocs := spamDocs + hamDocs
	if totalDocs == 0 {
		totalDocs = 1
	}
	priorSpam := float64(spamDocs) / float64(totalDocs)
	priorHam := float64(hamDocs) / float64(totalDocs)

	vocab := make(map[string]bool)
	for t := range spamCount {
		vocab[t] = true
	}
	for t := range hamCount {
		vocab[t] = true
	}

	return &NBModel{
		PriorSpam: priorSpam,
		PriorHam:  priorHam,
		SpamCount: spamCount,
		HamCount:  hamCount,
		SpamTotal: spamTotal,
		HamTotal:  hamTotal,
		VocabSize: len(vocab),
	}
}

// LabeledEmail is one training example.
type LabeledEmail struct {
	Label   string `json:"label"`
	Subject string `json:"subject"`
	Body    string `json:"body"`
}

// PSpam returns P(spam | text) using the model. Returns 0..1.
func (m *NBModel) PSpam(subject, body string) float64 {
	if m == nil {
		return -1
	}
	text := subject + " " + body
	tokens := tokenize(text)
	if len(tokens) == 0 {
		return m.PriorSpam
	}

	// log P(spam) + sum log P(token|spam)
	logPSpam := math.Log(m.PriorSpam + 1e-10)
	logPHam := math.Log(m.PriorHam + 1e-10)
	vocabSize := float64(m.VocabSize)
	for _, t := range tokens {
		if len(t) < 2 {
			continue
		}
		spamC := m.SpamCount[t] + smoothing
		hamC := m.HamCount[t] + smoothing
		logPSpam += math.Log(spamC / (m.SpamTotal + smoothing*vocabSize))
		logPHam += math.Log(hamC / (m.HamTotal + smoothing*vocabSize))
	}

	// P(spam|text) = P(text|spam)P(spam) / (P(text|spam)P(spam) + P(text|ham)P(ham))
	// Use log-sum-exp for numerical stability
	maxLog := logPSpam
	if logPHam > maxLog {
		maxLog = logPHam
	}
	pSpam := math.Exp(logPSpam - maxLog)
	pHam := math.Exp(logPHam - maxLog)
	denom := pSpam + pHam
	if denom < 1e-20 {
		return m.PriorSpam
	}
	return pSpam / denom
}

// Save writes the model to a JSON file.
func (m *NBModel) Save(path string) error {
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()
	enc := json.NewEncoder(f)
	enc.SetIndent("", "  ")
	return enc.Encode(m)
}

// LoadNB loads a model from JSON. Returns nil if file missing or invalid.
func LoadNB(path string) (*NBModel, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var m NBModel
	if err := json.Unmarshal(data, &m); err != nil {
		return nil, err
	}
	return &m, nil
}

// SetModelPath sets the path to load the model from (for CheckWithModel).
func SetModelPath(p string) {
	modelPath = p
	loadedModel = nil
	modelLoadOnce = sync.Once{}
}

// LoadModelOnce loads the model once (if path set) and returns it.
func LoadModelOnce() *NBModel {
	if modelPath == "" {
		return nil
	}
	modelLoadOnce.Do(func() {
		m, err := LoadNB(modelPath)
		if err != nil {
			return
		}
		loadedModel = m
	})
	return loadedModel
}

// CheckWithModel runs the trained model on subject+body and returns P(spam) 0..1, or -1 if no model.
func CheckWithModel(subject, body string) float64 {
	m := LoadModelOnce()
	if m == nil {
		return -1
	}
	return m.PSpam(subject, body)
}

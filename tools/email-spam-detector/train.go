package main

import (
	"encoding/csv"
	"fmt"
	"os"
	"strings"
)

// RunTrain reads a CSV file (label,subject,body) and trains the Naive Bayes model, then saves to modelPath.
func RunTrain(csvPath, modelPath string) error {
	f, err := os.Open(csvPath)
	if err != nil {
		return err
	}
	defer f.Close()
	r := csv.NewReader(f)
	records, err := r.ReadAll()
	if err != nil {
		return err
	}
	if len(records) < 2 {
		return fmt.Errorf("CSV needs header + at least one row")
	}
	// Expect: label, subject, body (or subject, body, label)
	header := records[0]
	var labelIdx, subjIdx, bodyIdx int
	for i, h := range header {
		h = strings.ToLower(strings.TrimSpace(h))
		switch h {
		case "label", "class", "tag":
			labelIdx = i
		case "subject", "subj":
			subjIdx = i
		case "body", "text", "content", "message":
			bodyIdx = i
		}
	}
	// If not found by name, assume order: label, subject, body
	if (labelIdx == 0 && subjIdx == 0 && bodyIdx == 0) && len(header) >= 3 {
		labelIdx, subjIdx, bodyIdx = 0, 1, 2
	}
	var examples []LabeledEmail
	for _, row := range records[1:] {
		if len(row) <= labelIdx || len(row) <= subjIdx || len(row) <= bodyIdx {
			continue
		}
		examples = append(examples, LabeledEmail{
			Label:   strings.TrimSpace(row[labelIdx]),
			Subject: strings.TrimSpace(row[subjIdx]),
			Body:    strings.TrimSpace(row[bodyIdx]),
		})
	}
	if len(examples) == 0 {
		return fmt.Errorf("no valid rows in CSV")
	}
	model := TrainNB(examples)
	if err := model.Save(modelPath); err != nil {
		return err
	}
	fmt.Fprintf(os.Stderr, "Trained on %d examples, vocab size %d, saved to %s\n", len(examples), model.VocabSize, modelPath)
	return nil
}

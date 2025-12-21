package ime

import (
	"bufio"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

// Frequency dictionary: word -> weight (0..1)
type freqDict map[string]float64

func loadFreqDict(baseDir string) freqDict {
	d := make(freqDict)
	path := filepath.Join(baseDir, "data", "tamil_freq.tsv")
	file, err := os.Open(path)
	if err != nil {
		return d
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		parts := strings.Split(line, "\t")
		if len(parts) < 2 {
			continue
		}
		w := strings.TrimSpace(parts[0])
		val, err := strconv.ParseFloat(strings.TrimSpace(parts[1]), 64)
		if err != nil {
			continue
		}
		if val > 1 {
			val = val / 100.0
		}
		if val < 0 {
			val = 0
		}
		d[w] = val
	}
	return d
}

func (d freqDict) Score(word string) float64 {
	if len(d) == 0 || word == "" {
		return 0
	}
	if v, ok := d[word]; ok {
		return v
	}
	return 0
}

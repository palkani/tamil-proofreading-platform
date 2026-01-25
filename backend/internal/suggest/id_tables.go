package suggest

type IDTables struct {
	// Arrays keyed by ID (dense). Index 0 unused.
	TamilByID      []string
	LatinByID      []string
	GlobalFreqByID []int32
	BoostByID      []float32
}

func NewIDTables(maxID int) *IDTables {
	size := maxID + 1
	return &IDTables{
		TamilByID:      make([]string, size),
		LatinByID:      make([]string, size),
		GlobalFreqByID: make([]int32, size),
		BoostByID:      make([]float32, size),
	}
}

func (t *IDTables) BaseScore(id int32) float64 {
	if id <= 0 || int(id) >= len(t.GlobalFreqByID) {
		return 0
	}
	freq := float64(t.GlobalFreqByID[id])
	boost := float64(t.BoostByID[id])
	return freq + boost
}


package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"net/http"
	"sort"
	"time"
)

type Resp struct {
	Suggestions []struct {
		Text string  `json:"text"`
		Word string  `json:"word"`
		Score float64 `json:"score"`
	} `json:"suggestions"`
}

func main() {
	var base string
	var n int
	flag.StringVar(&base, "url", "http://localhost:8080/api/v1/suggest", "suggest endpoint")
	flag.IntVar(&n, "n", 500, "number of requests")
	flag.Parse()

	queries := []string{"ta", "tam", "tami", "sor", "soru", "sap", "sapt", "sapti", "van", "vana", "vanak", "nan", "nand", "nandri"}
	client := &http.Client{Timeout: 2 * time.Second}

	lat := make([]float64, 0, n)
	for i := 0; i < n; i++ {
		q := queries[i%len(queries)]
		url := fmt.Sprintf("%s?q=%s&limit=5", base, q)
		start := time.Now()
		resp, err := client.Get(url)
		if err != nil {
			fmt.Printf("request error: %v\n", err)
			continue
		}
		_ = json.NewDecoder(resp.Body).Decode(&Resp{})
		resp.Body.Close()
		ms := float64(time.Since(start).Microseconds()) / 1000.0
		lat = append(lat, ms)
	}

	if len(lat) == 0 {
		fmt.Println("no samples")
		return
	}
	sort.Float64s(lat)
	p50 := lat[int(float64(len(lat)-1)*0.50)]
	p95 := lat[int(float64(len(lat)-1)*0.95)]
	p99 := lat[int(float64(len(lat)-1)*0.99)]
	fmt.Printf("samples=%d p50=%.2fms p95=%.2fms p99=%.2fms\n", len(lat), p50, p95, p99)
}


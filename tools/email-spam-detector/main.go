package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
)

func main() {
	subject := flag.String("subject", "", "Email subject line")
	bodyFile := flag.String("body", "", "Path to file containing email body (or use stdin)")
	serve := flag.String("serve", "", "Start HTTP server on address (e.g. :8080)")
	jsonOut := flag.Bool("json", false, "Output result as JSON")
	modelPath := flag.String("model", "", "Path to trained Naive Bayes model JSON (or SPAM_MODEL env)")
	spamcPath := flag.String("spamc", "", "Path to spamc binary (or SPAMC_PATH env); use -spamd for spamd")
	spamdAddr := flag.String("spamd", "", "Spamd address (e.g. 127.0.0.1:783) (or SPAMD_ADDR env)")
	providerURL := flag.String("provider", "", "External spam-check API URL (or SPAM_PROVIDER_URL env)")
	providerKey := flag.String("provider-key", "", "API key for provider (or SPAM_PROVIDER_KEY env)")
	flag.Parse()

	// Train subcommand: train <csv> [model_out]
	if len(flag.Args()) >= 1 && flag.Arg(0) == "train" {
		if len(flag.Args()) < 2 {
			fmt.Fprintf(os.Stderr, "usage: %s train <csv_path> [model_out.json]\n", os.Args[0])
			os.Exit(1)
		}
		csvPath := flag.Arg(1)
		outModel := "spam-model.json"
		if len(flag.Args()) >= 3 {
			outModel = flag.Arg(2)
		}
		if err := RunTrain(csvPath, outModel); err != nil {
			fmt.Fprintf(os.Stderr, "train error: %v\n", err)
			os.Exit(1)
		}
		return
	}

	// Apply config from env if flags not set
	if *modelPath == "" {
		*modelPath = os.Getenv("SPAM_MODEL")
	}
	if *spamcPath == "" {
		*spamcPath = os.Getenv("SPAMC_PATH")
	}
	if *spamdAddr == "" {
		*spamdAddr = os.Getenv("SPAMD_ADDR")
	}
	if *providerURL == "" {
		*providerURL = os.Getenv("SPAM_PROVIDER_URL")
	}
	if *providerKey == "" {
		*providerKey = os.Getenv("SPAM_PROVIDER_KEY")
	}
	SetModelPath(*modelPath)
	ConfigureSpamAssassin(*spamcPath, *spamdAddr, 5.0)
	ConfigureProvider(*providerURL, *providerKey)

	if *serve != "" {
		runServer(*serve, *jsonOut, *modelPath, *spamcPath, *spamdAddr, *providerURL)
		return
	}

	var body string
	if *bodyFile != "" {
		data, err := os.ReadFile(*bodyFile)
		if err != nil {
			fmt.Fprintf(os.Stderr, "error reading body file: %v\n", err)
			os.Exit(1)
		}
		body = string(data)
	} else {
		data, err := io.ReadAll(os.Stdin)
		if err != nil {
			fmt.Fprintf(os.Stderr, "error reading stdin: %v\n", err)
			os.Exit(1)
		}
		body = string(data)
	}

	subj := *subject
	if subj == "" && len(flag.Args()) > 0 {
		subj = flag.Args()[0]
	}

	var result Result
	if *modelPath != "" || *spamcPath != "" || *spamdAddr != "" || *providerURL != "" {
		result = CheckFull(subj, body)
	} else {
		result = Check(subj, body)
	}

	if *jsonOut {
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		_ = enc.Encode(result)
		return
	}

	// Human-readable output
	verdict := "NOT SPAM"
	if result.IsSpam {
		verdict = "SPAM"
	}
	fmt.Printf("Verdict: %s (score: %.1f, confidence: %s)\n", verdict, result.Score, result.Confidence)
	if len(result.Reasons) > 0 {
		fmt.Println("Reasons:")
		for _, r := range result.Reasons {
			fmt.Printf("  - %s\n", r)
		}
	}
	if result.IsSpam {
		os.Exit(1)
	}
}

func runServer(addr string, _ bool, modelPath, spamcPath, spamdAddr, providerURL string) {
	SetModelPath(modelPath)
	ConfigureSpamAssassin(spamcPath, spamdAddr, 5.0)
	if providerURL != "" {
		ConfigureProvider(providerURL, os.Getenv("SPAM_PROVIDER_KEY"))
	}
	http.HandleFunc("/check", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		contentType := r.Header.Get("Content-Type")
		var subject, body string
		if strings.Contains(contentType, "application/json") {
			var req struct {
				Subject string `json:"subject"`
				Body    string `json:"body"`
			}
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				http.Error(w, "invalid JSON: "+err.Error(), http.StatusBadRequest)
				return
			}
			subject, body = req.Subject, req.Body
		} else {
			if err := r.ParseForm(); err != nil {
				http.Error(w, "invalid form", http.StatusBadRequest)
				return
			}
			subject = r.FormValue("subject")
			body = r.FormValue("body")
		}
		var result Result
		if modelPath != "" || spamcPath != "" || spamdAddr != "" || providerURL != "" {
			result = CheckFull(subject, body)
		} else {
			result = Check(subject, body)
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(result)
	})
	http.HandleFunc("/health", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})
	fmt.Fprintf(os.Stderr, "Email spam detector listening on %s\n", addr)
	if err := http.ListenAndServe(addr, nil); err != nil {
		fmt.Fprintf(os.Stderr, "server error: %v\n", err)
		os.Exit(1)
	}
}

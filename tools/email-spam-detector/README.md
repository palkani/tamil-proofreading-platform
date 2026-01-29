# Email Spam Detector

A tool to classify email content as **spam** or **not spam**. It supports:

1. **Heuristics** – keyword density, link count, caps ratio, urgency language (no dependencies).
2. **Trained Naive Bayes model** – train on your own CSV, then load the model for inference.
3. **SpamAssassin** – use `spamc` or connect to `spamd` for rule-based scoring.
4. **Provider API** – call an external HTTP API (e.g. your own or a third-party spam-check service).

Priority when multiple are configured: **Provider → SpamAssassin → Model → Heuristics**.

---

## Build

```bash
cd tools/email-spam-detector
go build -o email-spam-detector .
```

---

## 1. Heuristics only (default)

No config; works out of the box.

```bash
echo "Congratulations! You have won a million dollars. Click here to claim." | ./email-spam-detector
./email-spam-detector -subject "Urgent: Verify your account" -body message.txt -json
```

---

## 2. Trained Naive Bayes classifier

**Train** on a CSV with columns `label`, `subject`, `body` (or `class`/`text`; header names are flexible).

```bash
# Train (output: spam-model.json)
./email-spam-detector train examples/sample.csv spam-model.json
```

CSV format:
```csv
label,subject,body
spam,Urgent: Claim prize,Click here to get your free gift!!!
ham,Meeting tomorrow,Can we meet at 3pm to discuss the report?
```

**Run** with the model (higher priority than heuristics):

```bash
./email-spam-detector -model spam-model.json -subject "Claim now" -body "Click here!!!"
# or
export SPAM_MODEL=spam-model.json
./email-spam-detector -subject "Claim now" -body "Click here!!!"
```

Use more labeled data (hundreds/thousands of spam and ham) for better accuracy.

---

## 3. SpamAssassin

Use [SpamAssassin](https://spamassassin.apache.org/) for rule-based scoring.

**Option A – spamc** (requires SpamAssassin and `spamc` on PATH or explicit path):

```bash
./email-spam-detector -spamc /usr/bin/spamc -subject "Claim prize" -body "Click here!!!"
# or
export SPAMC_PATH=/usr/bin/spamc
./email-spam-detector -subject "Claim prize" -body "Click here!!!"
```

**Option B – spamd** (TCP to a running spamd):

```bash
./email-spam-detector -spamd 127.0.0.1:783 -subject "Claim prize" -body "Click here!!!"
# or
export SPAMD_ADDR=127.0.0.1:783
./email-spam-detector -subject "Claim prize" -body "Click here!!!"
```

SpamAssassin’s score is mapped to 0–100; typical threshold 5.0 → 50.

---

## 4. Provider API

Call an external spam-check API. The tool POSTs JSON `{"subject": "...", "body": "..."}` and expects JSON with `is_spam` (bool) and optionally `score` (0–100).

```bash
./email-spam-detector -provider https://api.example.com/spam-check -provider-key YOUR_KEY -subject "Hi" -body "Hello"
# or
export SPAM_PROVIDER_URL=https://api.example.com/spam-check
export SPAM_PROVIDER_KEY=YOUR_KEY
./email-spam-detector -subject "Hi" -body "Hello"
```

Provider response shape:
```json
{"is_spam": false, "score": 15}
```

Headers sent: `Content-Type: application/json`, and `Authorization: Bearer <key>` / `X-API-Key: <key>` if `-provider-key` is set.

---

## CLI reference

| Flag | Env | Description |
|------|-----|-------------|
| `-subject` | | Email subject |
| `-body` | | Path to body file (else stdin) |
| `-model` | `SPAM_MODEL` | Path to trained model JSON |
| `-spamc` | `SPAMC_PATH` | Path to `spamc` binary |
| `-spamd` | `SPAMD_ADDR` | Spamd address (e.g. `127.0.0.1:783`) |
| `-provider` | `SPAM_PROVIDER_URL` | External API URL |
| `-provider-key` | `SPAM_PROVIDER_KEY` | API key for provider |
| `-serve` | | HTTP server address (e.g. `:8080`) |
| `-json` | | Output result as JSON |

**Train:**
```bash
./email-spam-detector train <csv_path> [model_out.json]
```

---

## HTTP server

Run with optional model / SpamAssassin / provider:

```bash
./email-spam-detector -serve :8080 -model spam-model.json
./email-spam-detector -serve :8080 -spamd 127.0.0.1:783
./email-spam-detector -serve :8080 -provider https://api.example.com/check
```

**POST /check** – JSON body `{"subject": "...", "body": "..."}` or form `subject` + `body`.

Response includes `source`: `"heuristic"`, `"model"`, `"spamassassin"`, or `"provider"`.

**GET /health** – liveness.

---

## How heuristics work

When no model/SpamAssassin/provider is used, the built-in heuristic scores 0–100 using:

- Spam/urgent keyword density
- Proportion of capital letters
- Link density
- Urgency phrases
- Money amounts and digit density
- HTML-heavy content
- Short body + action subject
- Excessive punctuation

**Verdict:** `score >= 50` → spam. **Confidence:** low / medium / high from distance to 50.

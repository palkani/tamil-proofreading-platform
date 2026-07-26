# Tamil Handwriting to Text (ProofTamil)

Extract handwritten Tamil text from images (notes, whiteboard, scanned handwriting).
Used by the **Tamil Handwriting to Text** tool on ProofTamil.

## Pipeline

```
image → preprocess (deskew, flatten, denoise, CLAHE, binarize, upscale)
      → segment lines
      → 2-pass Gemini vision OCR (strict "transcribe exactly" prompt)
      → Tamil correction pass (fix OCR slips, never translate/rewrite)
      → confidence flagging (pass A/B disagreement + dictionary OOV)
      → { text, flagged_words, confidence_pct }
```

Two modes: **accurate** (default — 2 passes + correction, Gemini Pro) and **fast**
(single pass, no correction; or Tesseract when no key).

## Run the service

```bash
cd services/tamil-handwriting-ocr
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export GEMINI_API_KEY=...            # required for the Gemini pipeline
uvicorn api_server:app --host 0.0.0.0 --port 8000
```

## Environment

| Var | Purpose |
|---|---|
| `GEMINI_API_KEY` | **required** for the OCR + correction pipeline |
| `GEMINI_MODEL` | primary vision model (default `gemini-2.5-pro`) |
| `GEMINI_MODEL_FALLBACK` | on primary error (default `gemini-2.5-flash`) |
| `TAMIL_DICT_PATH` | Tamil word list (`.txt`/`.txt.gz`, one word per line) for the out-of-vocabulary flag. Optional but recommended — see below. |
| `DATA_LOGGING` | `true` to save (image, text) pairs for future fine-tuning (opt-in; stores user images — disclose in privacy policy) |
| `TRAINING_DATA_DIR` | where logged samples go (default `./training_data`) |
| `DEBUG` | `true` → uvicorn reload + dump preprocess steps to `debug/` |
| `HANDWRITING_OCR_URL` (main app) | e.g. `http://localhost:8000` so the Express app proxies here |

**Dictionary:** point `TAMIL_DICT_PATH` at a word list. The sibling ProofTamil v2
lexicon is a good source (`prooftamil/packages/tamil-rules/dictionaries/*.txt.gz`,
~349k words) — copy or symlink one in. Without it, confidence relies on the two-pass
agreement signal alone.

## API

- `GET /health` — status, `gemini` (key present), `gemini_model`, `tesseract_fallback`, `data_logging`.
- `POST /api/ocr/extract-words` — multipart form: `file` (image), optional `context`
  (topic hint), optional `mode` (`accurate` | `fast`). Response:
  ```json
  {
    "success": true, "engine": "gemini-2.5-pro", "mode": "accurate",
    "text": "…Tamil…", "full_text": "…same…",
    "flagged_words": [{"word": "…", "line": 3, "reason": "passes_disagree"}],
    "confidence_pct": 0.94, "lines_count": 5,
    "request_id": "…", "processing_time_ms": 4210.5
  }
  ```
  `full_text` is kept for backward compatibility with the existing Express proxy.
- `POST /api/ocr/log-correction` — body `{ "request_id", "corrected_text" }`. Stores
  the human-verified text against a prior request (only when `DATA_LOGGING=true`).

## Cost / performance

Accurate mode ≈ 2 OCR passes + 1 correction call per image (Gemini Pro). Use `fast`
mode (single pass) or `TAMIL_DICT_PATH`-only flagging to control cost. Preprocessing
and segmentation are local/CPU and cheap.

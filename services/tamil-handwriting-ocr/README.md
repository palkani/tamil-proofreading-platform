# Tamil Handwriting to Text (ProofTamil)

Extract handwritten Tamil text from images (notes, whiteboard, scanned handwriting). Used by the **Tamil Handwriting to Text** tool on ProofTamil.

## Run the service

```bash
cd services/tamil-handwriting-ocr
python -m venv .venv
source .venv/bin/activate   # or .venv\Scripts\activate on Windows
pip install -r requirements.txt
uvicorn api_server:app --host 0.0.0.0 --port 8000
```

**System Tesseract (for text when no ML model):** For end-to-end text extraction without a trained model, install Tesseract and Tamil language data so the service can use the Tesseract fallback:

- **macOS:** `brew install tesseract tesseract-lang` (or `tesseract tesseract-lang` for Tamil)
- **Ubuntu/Debian:** `sudo apt-get install tesseract-ocr tesseract-ocr-tam`
- **Windows:** Install from [UB-Mannheim/tesseract](https://github.com/UB-Mannheim/tesseract/wiki) and add Tamil data.

- **Without a model but with Tesseract:** Service uses Tesseract (Tamil) on the full image and returns `full_text`. Good for printed or clear handwriting.
- **Without model and without Tesseract:** Returns line/word boxes and empty word text.
- **With a trained model:** Place `tamil_ocr.pth` at `./models/tamil_ocr.pth` and install `torch`, then restart. Set `MODEL_PATH` if different.

## Environment

- `HANDWRITING_OCR_URL` (in main app): e.g. `http://localhost:8000` so the Express app can proxy requests here.
- `MODEL_PATH`: path to `.pth` model file (optional).
- `DEBUG`: `true` for reload.

## API

- `GET /health` — status, `ocr_available` (ML model loaded), `tesseract_fallback` (Tesseract available for fallback).
- `POST /api/ocr/extract-words` — body: multipart form with `file` (image). Response: `full_text`, `lines`, `words`, `processing_time_ms`, etc.

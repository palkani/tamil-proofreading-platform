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

- **Without a model**: Service runs in preprocess+segment mode; returns line/word boxes and empty word text. Useful for testing and UI.
- **With a trained model**: Place `tamil_ocr.pth` at `./models/tamil_ocr.pth` and install `torch`, then restart. Set `MODEL_PATH` if different.

## Environment

- `HANDWRITING_OCR_URL` (in main app): e.g. `http://localhost:8000` so the Express app can proxy requests here.
- `MODEL_PATH`: path to `.pth` model file (optional).
- `DEBUG`: `true` for reload.

## API

- `GET /health` — status and `ocr_available`.
- `POST /api/ocr/extract-words` — body: multipart form with `file` (image). Response: `full_text`, `lines`, `words`, `processing_time_ms`, etc.

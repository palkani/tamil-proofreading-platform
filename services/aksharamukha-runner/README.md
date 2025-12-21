# Aksharamukha Runner (Python)

Minimal FastAPI wrapper around the `aksharamukha` transliteration library.

## Run locally
```bash
cd services/aksharamukha-runner
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8088
```

Health check:
```bash
curl http://localhost:8088/health
```

Transliterate:
```bash
curl -X POST http://localhost:8088/transliterate \
  -H "Content-Type: application/json" \
  -d '{"text":"enathu","mode":"spoken"}'
```

## Docker / Cloud Run (optional)
```bash
cd services/aksharamukha-runner
docker build -t aksharamukha-runner .
docker run -p 8088:8088 aksharamukha-runner
```

Cloud Run example (update region/service name as needed):
```bash
gcloud run deploy aksharamukha-runner \
  --source . \
  --region asia-south1 \
  --allow-unauthenticated
```

## Notes
- Respects `X-Request-ID` header if provided; otherwise generates a UUID.
- Returns 200 with `success:true` even on errors; `output` may be empty.
- Input max length 50 chars; adjust in `app.py` if needed.


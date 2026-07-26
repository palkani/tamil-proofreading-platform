# Tamil handwriting OCR service (FastAPI + Gemini vision pipeline).
FROM python:3.11-slim

WORKDIR /app

# opencv-python-headless needs libglib at runtime; keep the image otherwise lean.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Cloud Run injects PORT; default to 8080.
ENV PORT=8080
EXPOSE 8080

CMD ["sh", "-c", "uvicorn api_server:app --host 0.0.0.0 --port ${PORT:-8080} --workers 1"]

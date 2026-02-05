FROM python:3.9-slim

# Runtime + build dependencies for native OCR module
RUN apt-get update && apt-get install -y \
    tesseract-ocr \
    tesseract-ocr-tam \
    tesseract-ocr-eng \
    poppler-utils \
    build-essential \
    cmake \
    pkg-config \
    libtesseract-dev \
    python3-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Python deps (pybind11 for building; pytesseract as fallback if native not built)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN pip install --no-cache-dir pybind11

# Copy app and build C++ module (build.sh copies .so into /app)
COPY . .
RUN chmod +x ocr_native/build.sh && ./ocr_native/build.sh || true

EXPOSE 5000
CMD ["python", "ocr_web_app.py"]

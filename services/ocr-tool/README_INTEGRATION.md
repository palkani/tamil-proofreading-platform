# OCR Tool Integration with ProofTamil

## Overview
The OCR tool has been integrated into the ProofTamil platform to extract Tamil and English text from images and PDFs.

## Features
- ✅ Extract text from images (JPG, PNG, TIFF, BMP, GIF)
- ✅ Extract text from PDF documents
- ✅ Support for Tamil and English languages
- ✅ Convert extracted text to Word format (.docx)
- ✅ Web-based interface integrated into ProofTamil

## Setup

### 1. Install System Dependencies

**Ubuntu/Debian:**
```bash
sudo apt-get update
sudo apt-get install -y tesseract-ocr tesseract-ocr-tam tesseract-ocr-eng poppler-utils
```

**macOS:**
```bash
brew install tesseract poppler
brew install tesseract-lang  # For Tamil support
```

### 2. Install Python Dependencies
```bash
cd services/ocr-tool
pip install -r requirements.txt
```

### 3. Environment Variables
Set the OCR service URL in your Express frontend:
```bash
export OCR_SERVICE_URL=http://localhost:5000
```

### 4. Run the OCR Service
```bash
cd services/ocr-tool
python ocr_web_app.py
```

The service will run on `http://localhost:5000`

## Integration Points

### Frontend
- **Route**: `/tools/ocr`
- **Template**: `express-frontend/views/pages/ocr-tool.ejs`
- **Homepage Link**: Updated tools menu on homepage

### API Routes
- **Upload**: `POST /api/ocr/upload`
- **Download**: `GET /api/ocr/download/:filename`

### Service
- **Location**: `services/ocr-tool/`
- **Port**: 5000 (default)
- **Language Support**: English + Tamil (default), Tamil only, English only

## Usage

1. Navigate to `/tools/ocr` on the ProofTamil website
2. Upload an image or PDF file
3. Select language preference (English + Tamil recommended)
4. Click "Extract Text"
5. View extracted text and download as Word document

## Docker Deployment

The service includes a Dockerfile for containerized deployment:

```bash
cd services/ocr-tool
docker build -t prooftamil-ocr .
docker run -p 5000:5000 prooftamil-ocr
```

## Notes

- Maximum file size: 16MB
- Supported formats: JPG, PNG, PDF, TIFF, BMP, GIF
- Tamil language support requires `tesseract-ocr-tam` package
- The service runs independently and is proxied through the Express frontend


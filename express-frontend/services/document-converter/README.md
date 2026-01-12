# Document Converter Service

This service provides document conversion capabilities for ProofTamil, allowing users to convert between PDF, DOCX, TXT, HTML, RTF, and ODT formats.

## Setup

### 1. Install System Dependencies

**Ubuntu/Debian:**
```bash
sudo apt-get update
sudo apt-get install -y python3-pip libreoffice pandoc poppler-utils
```

**macOS:**
```bash
brew install libreoffice pandoc poppler
```

**Verify installations:**
```bash
soffice --version
pandoc --version
```

### 2. Install Python Dependencies

```bash
cd express-frontend/services/document-converter
pip3 install -r requirements_converter.txt
```

### 3. Start the Service

```bash
python3 document_converter_api.py
```

The service will run on `http://localhost:5001`

## Configuration

Set the API URL in environment variables:

```bash
export CONVERTER_API_URL=http://localhost:5001
```

Or in `.env`:
```
CONVERTER_API_URL=http://localhost:5001
```

## API Endpoints

- `GET /api/health` - Health check
- `GET /api/supported-conversions` - Get supported format conversions
- `POST /api/convert` - Convert a document
- `GET /api/download/<filename>` - Download converted file

## Integration

The service is integrated into the Express frontend via:
- `express-frontend/services/document-converter/converter-service.js` - Node.js wrapper
- `express-frontend/routes/api.js` - API routes
- `express-frontend/views/pages/document-converter.ejs` - Frontend page

## Testing

Run tests with:
```bash
npm run test:tools
```

Or manually:
```bash
node express-frontend/tests/tools-test.js
```

## Troubleshooting

### LibreOffice Not Found
```bash
# Ubuntu
sudo apt-get install libreoffice

# macOS
brew install libreoffice
```

### Pandoc Not Found
```bash
# Ubuntu
sudo apt-get install pandoc

# macOS
brew install pandoc
```

### Service Not Starting
- Check if port 5001 is available
- Verify Python dependencies are installed
- Check logs for error messages


# Setup and Run Tests - ProofTamil Tools

## Quick Start

### 1. Create Test Files
```bash
cd express-frontend
node tests/create-test-files.js
```

### 2. Start Required Services

#### Start Express Frontend (if not running)
```bash
cd express-frontend
npm start
# Or for development:
npm run dev
```

#### Start Document Converter API (required for converter tests)
```bash
cd express-frontend/services/document-converter

# Install Python dependencies first
pip3 install -r requirements_converter.txt

# Start the service
python3 document_converter_api.py
```

The converter API will run on `http://localhost:5001`

### 3. Run Tests

```bash
cd express-frontend
npm run test:tools
```

## Full Test Run

Use the test runner script:
```bash
cd express-frontend
./tests/run-tests.sh
```

## What Gets Tested

### OCR Tool ✅
- Health check endpoint
- Image upload (PNG)
- PDF upload
- Text extraction
- Tamil language support

### Document Converter ✅
- Health check endpoint
- Supported conversions list
- TXT to DOCX conversion
- DOCX to PDF conversion (if test file available)
- File download

## Expected Output

```
🧪 Starting ProofTamil Tools Test Suite
============================================================

📸 OCR Tool Tests
------------------------------------------------------------
✓ OCR Health Check
✓ OCR Image Upload
✓ OCR PDF Upload

📄 Document Converter Tests
------------------------------------------------------------
✓ Converter Health Check
✓ Get Supported Conversions
✓ TXT to DOCX Conversion
⚠ DOCX to PDF Conversion (skipped - test file not found)

============================================================

📊 Test Summary
------------------------------------------------------------
Total Tests: 7
Passed: 6
Failed: 0
```

## Troubleshooting

### "Converter service is not available"
- Start the Document Converter API on port 5001
- Check if Python dependencies are installed
- Verify LibreOffice and Pandoc are installed

### "OCR service is not available"
- Ensure Tesseract.js is installed: `npm install tesseract.js`
- Check OCR service configuration

### Tests timing out
- Increase timeout values in `tools-test.js`
- Check network connectivity
- Verify services are running

## Before Production Deployment

1. ✅ Run all tests: `npm run test:tools`
2. ✅ Verify all tests pass
3. ✅ Test with real files (not just test files)
4. ✅ Test all conversion types
5. ✅ Verify Tamil text preservation
6. ✅ Test error handling
7. ✅ Verify file size limits
8. ✅ Test on different browsers
9. ✅ Test on mobile devices

## Manual Testing Checklist

### OCR Tool
- [ ] Upload PNG image with text
- [ ] Upload PDF with text
- [ ] Select Tamil language
- [ ] Verify text extraction
- [ ] Download Word document
- [ ] Copy text to clipboard

### Document Converter
- [ ] Upload PDF file
- [ ] Convert PDF to DOCX
- [ ] Convert DOCX to PDF
- [ ] Convert TXT to DOCX
- [ ] Convert HTML to PDF
- [ ] Verify Tamil text is preserved
- [ ] Download converted files
- [ ] Test error handling (invalid files)

## CI/CD Integration

Add to your GitHub Actions or CI pipeline:

```yaml
- name: Run Tools Tests
  run: |
    cd express-frontend
    npm install
    node tests/create-test-files.js
    npm run test:tools
```


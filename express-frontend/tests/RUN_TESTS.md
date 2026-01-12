# Running Tests - Step by Step Guide

## Prerequisites

1. **Node.js** installed (v14+)
2. **Express Frontend** dependencies installed
3. **Document Converter API** (optional, for converter tests)

## Step 1: Install Dependencies

```bash
cd express-frontend
npm install
```

## Step 2: Create Test Files

```bash
npm run test:tools:setup
# Or directly:
node tests/create-real-test-files.js
```

This creates:
- `test-image-with-text.png` - Image for OCR testing
- `test-pdf-with-text.pdf` - PDF for OCR testing
- `test-tamil-content.txt` - Tamil text for conversion
- `test-tamil-document.html` - HTML with Tamil content
- `test-document.rtf` - RTF file

## Step 3: Start Express Server

**Option A: Development mode (with auto-reload)**
```bash
npm run dev
```

**Option B: Production mode**
```bash
npm start
```

The server should start on `http://localhost:3000`

## Step 4: Start Document Converter API (Optional)

For Document Converter tests to work, start the Python Flask API:

```bash
cd express-frontend/services/document-converter
pip3 install -r requirements_converter.txt
python3 document_converter_api.py
```

This starts the converter API on `http://localhost:5001`

**Note:** Converter tests will be skipped if the API is not running.

## Step 5: Run Tests

### Basic Tests
```bash
npm run test:tools
```

### Comprehensive Tests (Recommended)
```bash
npm run test:tools:comprehensive
```

Or directly:
```bash
node tests/comprehensive-tools-test.js
```

## Expected Output

### Successful Test Run

```
🧪 Comprehensive ProofTamil Tools Test Suite
======================================================================
Base URL: http://localhost:3000
Converter API URL: http://localhost:5001
======================================================================

🔍 Checking if server is running...
✓ Server is running

📸 OCR Tool Tests
----------------------------------------------------------------------
  → Uploading image for OCR...
  → Extracted text length: 45 characters
  → Word document filename: test-image-with-text_extracted.docx
  → Testing Word document download...
  → Downloaded Word document: 10240 bytes
✓ OCR: Image Upload, Text Extraction, and Word Document Download

  → Uploading PDF for OCR...
  → Extracted text length: 120 characters
  → Word document filename: test-pdf-with-text_extracted.docx
  → Testing Word document download...
  → Downloaded Word document: 11264 bytes
✓ OCR: PDF Upload, Text Extraction, and Word Document Download

📄 Document Converter Tests
----------------------------------------------------------------------
  → Converting TXT to DOCX...
  → Conversion successful: TXT → DOCX
  → Output file: test-tamil-content_converted.docx
  → Size: 0.00 MB → 0.01 MB
  → Testing download of converted file...
  → Downloaded file: 11264 bytes
  → Verified: File is a valid DOCX (ZIP format)
✓ Converter: TXT to DOCX (with Tamil text)

  → Converting HTML to DOCX...
  → Conversion successful: HTML → DOCX
  → Output file: test-tamil-document_converted.docx
  → Testing download of converted file...
  → Downloaded file: 12288 bytes
✓ Converter: HTML to DOCX (with Tamil content)

  → Converting TXT to PDF...
  → Conversion successful: TXT → PDF
  → Output file: test-tamil-content_converted.pdf
  → Testing download of converted file...
  → Downloaded PDF: 15678 bytes (verified as valid PDF)
✓ Converter: TXT to PDF (with Tamil text)

======================================================================

📊 Test Summary
----------------------------------------------------------------------
Total Tests: 5
Passed: 5
Failed: 0

======================================================================
✅ All tests passed! Tools are ready for production.
======================================================================
```

## Troubleshooting

### "Server not running" Error

**Solution:** Start the Express server first:
```bash
cd express-frontend
npm start
```

### "Converter service is not available"

**Solution:** Start the Document Converter API:
```bash
cd express-frontend/services/document-converter
python3 document_converter_api.py
```

Or skip converter tests if you only want to test OCR.

### "Test file not found"

**Solution:** Create test files:
```bash
npm run test:tools:setup
```

### Tests Timing Out

**Possible causes:**
- Server is slow to respond
- Large file processing
- Network issues

**Solution:** Increase timeout in test file or check server logs.

### OCR Not Extracting Text

**Note:** Minimal test images may not contain extractable text. This is normal. For real testing, use actual images with visible text.

## Testing Individual Tools

### Test OCR Only

1. Start Express server
2. Run: `node tests/comprehensive-tools-test.js`
3. Only OCR tests will run (converter tests may fail if API not running)

### Test Converter Only

1. Start Express server
2. Start Document Converter API
3. Run: `node tests/comprehensive-tools-test.js`
4. Only converter tests will run

## Manual Testing

After automated tests pass, manually test:

1. **OCR Tool:**
   - Go to `http://localhost:3000/tools/ocr`
   - Upload an image with text
   - Verify text extraction
   - Download Word document
   - Open Word document and verify content

2. **Document Converter:**
   - Go to `http://localhost:3000/tools/converter`
   - Upload a TXT file
   - Convert to DOCX
   - Download and verify converted file
   - Test other conversions (PDF, HTML, etc.)

## CI/CD Integration

For automated testing in CI/CD:

```yaml
- name: Setup Node.js
  uses: actions/setup-node@v3
  with:
    node-version: '18'

- name: Install dependencies
  run: |
    cd express-frontend
    npm install

- name: Create test files
  run: |
    cd express-frontend
    npm run test:tools:setup

- name: Start server
  run: |
    cd express-frontend
    npm start &
    sleep 5

- name: Run tests
  run: |
    cd express-frontend
    npm run test:tools:comprehensive
```


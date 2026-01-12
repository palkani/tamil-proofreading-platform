# ProofTamil Tools Test Suite

This directory contains test cases for all ProofTamil tools including OCR and Document Converter.

## Prerequisites

1. **Node.js** (v14 or higher)
2. **Express Frontend** running on `http://localhost:3000`
3. **Document Converter API** running on `http://localhost:5001` (optional, will skip tests if not available)
4. **Test files** in `test-files/` directory

## Running Tests

### Run All Tests

```bash
cd express-frontend
node tests/tools-test.js
```

### With Custom URLs

```bash
TEST_BASE_URL=http://localhost:3000 CONVERTER_API_URL=http://localhost:5001 node tests/tools-test.js
```

## Test Coverage

### OCR Tool Tests

- ✅ Health check endpoint
- ✅ Image upload and processing (PNG)
- ✅ PDF upload and processing
- ✅ Tamil language support
- ✅ Text extraction validation
- ✅ Download functionality

### Document Converter Tests

- ✅ Health check endpoint
- ✅ Get supported conversions
- ✅ TXT to DOCX conversion
- ✅ DOCX to PDF conversion
- ✅ File download after conversion
- ✅ Error handling

## Test Files

Create test files in `test-files/` directory:

- `test-image.png` - Sample image for OCR testing
- `test-document.pdf` - Sample PDF for OCR testing
- `test-tamil.txt` - Sample Tamil text file for conversion
- `test-document.docx` - Sample DOCX file for conversion

## Expected Results

All tests should pass before deploying to production:

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
✓ DOCX to PDF Conversion

============================================================

📊 Test Summary
------------------------------------------------------------
Total Tests: 7
Passed: 7
Failed: 0
```

## Troubleshooting

### OCR Service Not Available

If OCR tests fail with "service not available", ensure:
- Tesseract.js is installed: `npm install tesseract.js`
- OCR service is properly configured in `express-frontend/services/ocr-service.js`

### Document Converter Service Not Available

If converter tests fail, ensure:
- Python Flask API is running on port 5001
- All dependencies are installed: `pip install -r requirements_converter.txt`
- LibreOffice and Pandoc are installed on the system

### Test Files Missing

Some tests may be skipped if test files are not found. Create minimal test files or update test paths in `tools-test.js`.

## Adding New Tests

To add new test cases:

1. Create a test function:
```javascript
async function testNewFeature() {
  // Your test logic
}
```

2. Add to test suite:
```javascript
await test('New Feature Test', testNewFeature);
```

3. Run tests to verify

## CI/CD Integration

Add to your CI/CD pipeline:

```yaml
- name: Run Tools Tests
  run: |
    cd express-frontend
    npm install
    node tests/tools-test.js
```


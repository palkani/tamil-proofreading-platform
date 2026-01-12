# Quick Start - Run Tests Locally

## ✅ Prerequisites Check

1. **Node.js installed** - Check: `node --version` (should be v14+)
2. **Dependencies installed** - Run: `cd express-frontend && npm install`
3. **Test files created** - Run: `npm run test:tools:setup`

## 🚀 Step-by-Step: Run All Tests

### Step 1: Create Test Files
```bash
cd express-frontend
npm run test:tools:setup
```

### Step 2: Start Express Server (Terminal 1)
```bash
cd express-frontend
npm start
```

Wait for: `Express server running on http://0.0.0.0:3000`

### Step 3: (Optional) Start Document Converter API (Terminal 2)
```bash
cd express-frontend/services/document-converter
pip3 install -r requirements_converter.txt
python3 document_converter_api.py
```

Wait for: `API running on: http://localhost:5001`

### Step 4: Run Tests (Terminal 3)
```bash
cd express-frontend
npm run test:tools:comprehensive
```

## 📊 Expected Output

### ✅ All Tests Pass
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
  → Extracted text length: XX characters
  → Word document filename: test-image-with-text_extracted.docx
  → Testing Word document download...
  → Downloaded Word document: XXXX bytes
✓ OCR: Image Upload, Text Extraction, and Word Document Download

  → Uploading PDF for OCR...
  → Extracted text length: XX characters
  → Word document filename: test-pdf-with-text_extracted.docx
  → Testing Word document download...
  → Downloaded Word document: XXXX bytes
✓ OCR: PDF Upload, Text Extraction, and Word Document Download

📄 Document Converter Tests
----------------------------------------------------------------------
  → Converting TXT to DOCX...
  → Conversion successful: TXT → DOCX
  → Output file: test-tamil-content_converted.docx
  → Size: 0.00 MB → 0.01 MB
  → Testing download of converted file...
  → Downloaded file: XXXX bytes
  → Verified: File is a valid DOCX (ZIP format)
✓ Converter: TXT to DOCX (with Tamil text)

  → Converting HTML to DOCX...
  → Conversion successful: HTML → DOCX
  → Output file: test-tamil-document_converted.docx
  → Testing download of converted file...
  → Downloaded file: XXXX bytes
✓ Converter: HTML to DOCX (with Tamil content)

  → Converting TXT to PDF...
  → Conversion successful: TXT → PDF
  → Output file: test-tamil-content_converted.pdf
  → Testing download of converted file...
  → Downloaded PDF: XXXX bytes (verified as valid PDF)
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

## ⚠️ Common Issues

### Issue: "Server not running"
**Solution:** Make sure Express server is running in Terminal 1

### Issue: "Converter service is not available"
**Solution:** 
- Start Document Converter API in Terminal 2, OR
- Skip converter tests (OCR tests will still run)

### Issue: "Test file not found"
**Solution:** Run `npm run test:tools:setup` first

### Issue: OCR not extracting text
**Note:** Minimal test images may not have extractable text. This is normal. For real testing, use actual images with visible text.

## 🎯 What Gets Tested

### OCR Tool ✅
- ✅ Uploads PNG image
- ✅ Extracts text from image
- ✅ Creates Word document
- ✅ Downloads Word document
- ✅ Verifies file format

- ✅ Uploads PDF
- ✅ Extracts text from PDF
- ✅ Creates Word document
- ✅ Downloads Word document
- ✅ Verifies file format

### Document Converter ✅
- ✅ TXT → DOCX conversion
- ✅ HTML → DOCX conversion
- ✅ TXT → PDF conversion
- ✅ Tamil text preservation
- ✅ File download
- ✅ Format validation

## 📝 After Tests Pass

1. ✅ All automated tests pass
2. ✅ Manually test OCR tool at `http://localhost:3000/tools/ocr`
3. ✅ Manually test Document Converter at `http://localhost:3000/tools/converter`
4. ✅ Test with real files (not just test files)
5. ✅ Verify Tamil text is preserved correctly
6. ✅ Ready for production deployment!

---

**Ready to test?** Follow the steps above! 🚀


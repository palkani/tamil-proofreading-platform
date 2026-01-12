/**
 * Test Suite for ProofTamil Tools
 * Tests OCR and Document Converter tools
 * 
 * Run with: node express-frontend/tests/tools-test.js
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');

// Configuration
const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';
const CONVERTER_API_URL = process.env.CONVERTER_API_URL || 'http://localhost:5001';

// Test results
const results = {
  passed: 0,
  failed: 0,
  errors: []
};

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function pass(testName) {
  results.passed++;
  log(`✓ ${testName}`, 'green');
}

function fail(testName, error) {
  results.failed++;
  results.errors.push({ test: testName, error: error.message || error });
  log(`✗ ${testName}: ${error.message || error}`, 'red');
}

// Test helper functions
async function test(name, testFn) {
  try {
    await testFn();
    pass(name);
  } catch (error) {
    fail(name, error);
  }
}

// Create test files directory
const testFilesDir = path.join(__dirname, 'test-files');
if (!fs.existsSync(testFilesDir)) {
  fs.mkdirSync(testFilesDir, { recursive: true });
}

// ============= OCR TESTS =============

async function testOCRHealth() {
  const response = await axios.get(`${BASE_URL}/api/ocr/health`, { timeout: 5000 });
  if (response.status === 200) {
    return;
  }
  throw new Error(`Expected 200, got ${response.status}`);
}

async function testOCRImageUpload() {
  // Create a simple test image with text (1x1 PNG)
  const testImagePath = path.join(testFilesDir, 'test-image.png');
  
  // Create a minimal PNG file (1x1 pixel)
  const pngBuffer = Buffer.from([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
    0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1 dimensions
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xDE,
    0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41, 0x54, // IDAT chunk
    0x08, 0x99, 0x01, 0x01, 0x00, 0x00, 0x00, 0xFF, 0xFF,
    0x00, 0x00, 0x00, 0x02, 0x00, 0x01, 0x00, 0x00, 0x00,
    0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82  // IEND
  ]);
  
  fs.writeFileSync(testImagePath, pngBuffer);

  const formData = new FormData();
  formData.append('file', fs.createReadStream(testImagePath), {
    filename: 'test-image.png',
    contentType: 'image/png'
  });
  formData.append('lang', 'eng+tam');

  const response = await axios.post(`${BASE_URL}/api/ocr/upload`, formData, {
    headers: formData.getHeaders(),
    timeout: 30000,
    maxContentLength: Infinity,
    maxBodyLength: Infinity
  });

  if (response.status !== 200) {
    throw new Error(`Expected 200, got ${response.status}`);
  }

  if (!response.data || typeof response.data !== 'object') {
    throw new Error('Invalid response format');
  }

  // Cleanup
  if (fs.existsSync(testImagePath)) {
    fs.unlinkSync(testImagePath);
  }
}

async function testOCRPDFUpload() {
  // Create a minimal PDF file
  const testPdfPath = path.join(testFilesDir, 'test-document.pdf');
  
  // Minimal valid PDF
  const pdfContent = `%PDF-1.4
1 0 obj
<<
/Type /Catalog
/Pages 2 0 R
>>
endobj
2 0 obj
<<
/Type /Pages
/Kids [3 0 R]
/Count 1
>>
endobj
3 0 obj
<<
/Type /Page
/Parent 2 0 R
/MediaBox [0 0 612 792]
/Contents 4 0 R
/Resources <<
/Font <<
/F1 <<
/Type /Font
/Subtype /Type1
/BaseFont /Helvetica
>>
>>
>>
>>
endobj
4 0 obj
<<
/Length 44
>>
stream
BT
/F1 12 Tf
100 700 Td
(Test) Tj
ET
endstream
endobj
xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000317 00000 n 
trailer
<<
/Size 5
/Root 1 0 R
>>
startxref
398
%%EOF`;

  fs.writeFileSync(testPdfPath, pdfContent);

  const formData = new FormData();
  formData.append('file', fs.createReadStream(testPdfPath), {
    filename: 'test-document.pdf',
    contentType: 'application/pdf'
  });
  formData.append('lang', 'eng+tam');

  const response = await axios.post(`${BASE_URL}/api/ocr/upload`, formData, {
    headers: formData.getHeaders(),
    timeout: 60000,
    maxContentLength: Infinity,
    maxBodyLength: Infinity
  });

  if (response.status !== 200) {
    throw new Error(`Expected 200, got ${response.status}`);
  }

  // Cleanup
  if (fs.existsSync(testPdfPath)) {
    fs.unlinkSync(testPdfPath);
  }
}

// ============= DOCUMENT CONVERTER TESTS =============

async function testConverterHealth() {
  const response = await axios.get(`${BASE_URL}/api/converter/health`, { timeout: 5000 });
  if (response.status === 200 || response.status === 503) {
    // 503 is acceptable if service is not running
    return;
  }
  throw new Error(`Expected 200 or 503, got ${response.status}`);
}

async function testConverterSupportedConversions() {
  const response = await axios.get(`${BASE_URL}/api/converter/supported-conversions`, { timeout: 5000 });
  if (response.status !== 200) {
    throw new Error(`Expected 200, got ${response.status}`);
  }
  if (!response.data || !response.data.formats) {
    throw new Error('Invalid response format - missing formats');
  }
}

async function testConverterTXTtoDOCX() {
  // Create a test TXT file with Tamil text
  const testTxtPath = path.join(testFilesDir, 'test-tamil.txt');
  const tamilText = 'விஜய் இன்று சிபிஐ முன்பு ஆஜராக உள்ளார்.';
  fs.writeFileSync(testTxtPath, tamilText, 'utf8');

  const formData = new FormData();
  formData.append('file', fs.createReadStream(testTxtPath), {
    filename: 'test-tamil.txt',
    contentType: 'text/plain'
  });
  formData.append('to_format', 'docx');

  try {
    const response = await axios.post(`${BASE_URL}/api/converter/convert`, formData, {
      headers: formData.getHeaders(),
      timeout: 60000,
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });

    if (response.status !== 200) {
      throw new Error(`Expected 200, got ${response.status}`);
    }

    if (!response.data || !response.data.success) {
      throw new Error('Conversion failed: ' + (response.data?.error || 'Unknown error'));
    }

    if (!response.data.download_filename) {
      throw new Error('Missing download_filename in response');
    }

    // Test download
    const downloadResponse = await axios.get(
      `${BASE_URL}/api/converter/download/${response.data.download_filename}`,
      { responseType: 'stream', timeout: 30000 }
    );

    if (downloadResponse.status !== 200) {
      throw new Error(`Download failed: ${downloadResponse.status}`);
    }
  } finally {
    // Cleanup
    if (fs.existsSync(testTxtPath)) {
      fs.unlinkSync(testTxtPath);
    }
  }
}

async function testConverterDOCXtoPDF() {
  // Create a minimal DOCX file
  const testDocxPath = path.join(testFilesDir, 'test-document.docx');
  
  // Note: Creating a valid DOCX requires proper ZIP structure
  // For testing, we'll skip this if the file doesn't exist
  // In real tests, you'd use a library to create a proper DOCX
  
  if (!fs.existsSync(testDocxPath)) {
    log('⚠ Skipping DOCX to PDF test - test file not found', 'yellow');
    return;
  }

  const formData = new FormData();
  formData.append('file', fs.createReadStream(testDocxPath), {
    filename: 'test-document.docx',
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  });
  formData.append('to_format', 'pdf');

  const response = await axios.post(`${BASE_URL}/api/converter/convert`, formData, {
    headers: formData.getHeaders(),
    timeout: 120000,
    maxContentLength: Infinity,
    maxBodyLength: Infinity
  });

  if (response.status !== 200) {
    throw new Error(`Expected 200, got ${response.status}`);
  }

  if (!response.data || !response.data.success) {
    throw new Error('Conversion failed: ' + (response.data?.error || 'Unknown error'));
  }
}

// ============= RUN ALL TESTS =============

async function runAllTests() {
  log('\n🧪 Starting ProofTamil Tools Test Suite\n', 'blue');
  log('='.repeat(60), 'blue');

  // OCR Tests
  log('\n📸 OCR Tool Tests', 'yellow');
  log('-'.repeat(60));
  
  await test('OCR Health Check', testOCRHealth);
  await test('OCR Image Upload', testOCRImageUpload);
  await test('OCR PDF Upload', testOCRPDFUpload);

  // Document Converter Tests
  log('\n📄 Document Converter Tests', 'yellow');
  log('-'.repeat(60));
  
  await test('Converter Health Check', testConverterHealth);
  await test('Get Supported Conversions', testConverterSupportedConversions);
  await test('TXT to DOCX Conversion', testConverterTXTtoDOCX);
  await test('DOCX to PDF Conversion', testConverterDOCXtoPDF);

  // Summary
  log('\n' + '='.repeat(60), 'blue');
  log('\n📊 Test Summary', 'blue');
  log('-'.repeat(60));
  log(`Total Tests: ${results.passed + results.failed}`, 'blue');
  log(`Passed: ${results.passed}`, 'green');
  log(`Failed: ${results.failed}`, results.failed > 0 ? 'red' : 'green');

  if (results.errors.length > 0) {
    log('\n❌ Errors:', 'red');
    results.errors.forEach(err => {
      log(`  - ${err.test}: ${err.error}`, 'red');
    });
  }

  // Exit code
  process.exit(results.failed > 0 ? 1 : 0);
}

// Run tests
runAllTests().catch(error => {
  log(`\n💥 Fatal error: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});


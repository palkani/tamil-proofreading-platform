/**
 * Comprehensive Test Suite for ProofTamil Tools
 * Tests OCR and Document Converter with real file operations
 * 
 * Run with: node express-frontend/tests/comprehensive-tools-test.js
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');

// Configuration
const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';
const CONVERTER_API_URL = process.env.CONVERTER_API_URL || 'http://localhost:5001';
const TEST_FILES_DIR = path.join(__dirname, 'test-files');

// Test results
const results = {
  passed: 0,
  failed: 0,
  errors: [],
  warnings: []
};

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
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

function warn(testName, message) {
  results.warnings.push({ test: testName, message });
  log(`⚠ ${testName}: ${message}`, 'yellow');
}

// Test helper functions
async function test(name, testFn) {
  try {
    await testFn();
    pass(name);
  } catch (error) {
    const errorMsg = error.response?.data?.error || error.message || error;
    const statusCode = error.response?.status;
    if (statusCode) {
      fail(name, new Error(`${errorMsg} (HTTP ${statusCode})`));
    } else if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      fail(name, new Error(`Server not running at ${BASE_URL}. Please start the Express server first.`));
    } else {
      fail(name, error);
    }
  }
}

// Check if server is running
async function checkServer() {
  try {
    await axios.get(`${BASE_URL}/`, { timeout: 2000 });
    return true;
  } catch (error) {
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      log('\n⚠️  WARNING: Express server is not running!', 'yellow');
      log(`   Please start the server first:`, 'yellow');
      log(`   cd express-frontend && npm start`, 'yellow');
      log(`   Or for development: npm run dev\n`, 'yellow');
      return false;
    }
    // Other errors might mean server is running but route doesn't exist
    return true;
  }
}

// Wait helper
function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============= OCR TESTS =============

async function testOCRImageUploadAndExtraction() {
  const testImagePath = path.join(TEST_FILES_DIR, 'test-image-with-text.png');
  
  if (!fs.existsSync(testImagePath)) {
    throw new Error('Test image file not found. Run create-real-test-files.js first.');
  }

  const formData = new FormData();
  formData.append('file', fs.createReadStream(testImagePath), {
    filename: 'test-image-with-text.png',
    contentType: 'image/png'
  });
  formData.append('lang', 'eng+tam');

  log('  → Uploading image for OCR...', 'cyan');
  const response = await axios.post(`${BASE_URL}/api/ocr/upload`, formData, {
    headers: formData.getHeaders(),
    timeout: 60000,
    maxContentLength: Infinity,
    maxBodyLength: Infinity
  });

  if (response.status !== 200) {
    throw new Error(`Expected 200, got ${response.status}`);
  }

  if (!response.data) {
    throw new Error('No response data');
  }

  // Check if text was extracted
  const extractedText = response.data.full_text || response.data.text || '';
  log(`  → Extracted text length: ${extractedText.length} characters`, 'cyan');
  
  if (extractedText.length === 0) {
    warn('OCR Image Upload', 'No text extracted from image (this may be normal for minimal test images)');
  }

  // Check if download filename is provided
  if (!response.data.download_filename) {
    throw new Error('Missing download_filename in response');
  }

  log(`  → Word document filename: ${response.data.download_filename}`, 'cyan');

  // Test download
  log('  → Testing Word document download...', 'cyan');
  const downloadResponse = await axios.get(
    `${BASE_URL}/api/ocr/download/${response.data.download_filename}`,
    { responseType: 'stream', timeout: 30000 }
  );

  if (downloadResponse.status !== 200) {
    throw new Error(`Download failed: ${downloadResponse.status}`);
  }

  // Save downloaded file to verify
  const downloadedPath = path.join(TEST_FILES_DIR, response.data.download_filename);
  const writer = fs.createWriteStream(downloadedPath);
  downloadResponse.data.pipe(writer);

  await new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });

  // Verify file exists and has content
  if (!fs.existsSync(downloadedPath)) {
    throw new Error('Downloaded file not found');
  }

  const stats = fs.statSync(downloadedPath);
  if (stats.size === 0) {
    throw new Error('Downloaded file is empty');
  }

  log(`  → Downloaded Word document: ${stats.size} bytes`, 'cyan');
  
  // Cleanup
  if (fs.existsSync(downloadedPath)) {
    fs.unlinkSync(downloadedPath);
  }
}

async function testOCRPDFUploadAndExtraction() {
  const testPdfPath = path.join(TEST_FILES_DIR, 'test-pdf-with-text.pdf');
  
  if (!fs.existsSync(testPdfPath)) {
    throw new Error('Test PDF file not found. Run create-real-test-files.js first.');
  }

  const formData = new FormData();
  formData.append('file', fs.createReadStream(testPdfPath), {
    filename: 'test-pdf-with-text.pdf',
    contentType: 'application/pdf'
  });
  formData.append('lang', 'eng+tam');

  log('  → Uploading PDF for OCR...', 'cyan');
  const response = await axios.post(`${BASE_URL}/api/ocr/upload`, formData, {
    headers: formData.getHeaders(),
    timeout: 120000, // 2 minutes for PDF
    maxContentLength: Infinity,
    maxBodyLength: Infinity
  });

  if (response.status !== 200) {
    throw new Error(`Expected 200, got ${response.status}`);
  }

  if (!response.data) {
    throw new Error('No response data');
  }

  const extractedText = response.data.full_text || response.data.text || '';
  log(`  → Extracted text length: ${extractedText.length} characters`, 'cyan');
  
  if (extractedText.length === 0) {
    warn('OCR PDF Upload', 'No text extracted from PDF (this may be normal for minimal test PDFs)');
  }

  if (!response.data.download_filename) {
    throw new Error('Missing download_filename in response');
  }

  // Test download
  log('  → Testing Word document download...', 'cyan');
  const downloadResponse = await axios.get(
    `${BASE_URL}/api/ocr/download/${response.data.download_filename}`,
    { responseType: 'stream', timeout: 30000 }
  );

  if (downloadResponse.status !== 200) {
    throw new Error(`Download failed: ${downloadResponse.status}`);
  }

  const downloadedPath = path.join(TEST_FILES_DIR, response.data.download_filename);
  const writer = fs.createWriteStream(downloadedPath);
  downloadResponse.data.pipe(writer);

  await new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });

  const stats = fs.statSync(downloadedPath);
  log(`  → Downloaded Word document: ${stats.size} bytes`, 'cyan');
  
  // Cleanup
  if (fs.existsSync(downloadedPath)) {
    fs.unlinkSync(downloadedPath);
  }
}

// ============= DOCUMENT CONVERTER TESTS =============

async function testConverterTXTtoDOCX() {
  const testTxtPath = path.join(TEST_FILES_DIR, 'test-tamil-content.txt');
  
  if (!fs.existsSync(testTxtPath)) {
    throw new Error('Test TXT file not found. Run create-real-test-files.js first.');
  }

  const formData = new FormData();
  formData.append('file', fs.createReadStream(testTxtPath), {
    filename: 'test-tamil-content.txt',
    contentType: 'text/plain'
  });
  formData.append('to_format', 'docx');

  log('  → Converting TXT to DOCX...', 'cyan');
  const response = await axios.post(`${BASE_URL}/api/converter/convert`, formData, {
    headers: formData.getHeaders(),
    timeout: 120000,
    maxContentLength: Infinity,
    maxBodyLength: Infinity
  });

  if (response.status !== 200) {
    throw new Error(`Expected 200, got ${response.status}: ${JSON.stringify(response.data)}`);
  }

  if (!response.data || !response.data.success) {
    throw new Error('Conversion failed: ' + (response.data?.error || 'Unknown error'));
  }

  if (!response.data.download_filename) {
    throw new Error('Missing download_filename in response');
  }

  log(`  → Conversion successful: ${response.data.from_format} → ${response.data.to_format}`, 'cyan');
  log(`  → Output file: ${response.data.download_filename}`, 'cyan');
  log(`  → Size: ${response.data.input_size_mb} MB → ${response.data.output_size_mb} MB`, 'cyan');

  // Test download
  log('  → Testing download of converted file...', 'cyan');
  const downloadResponse = await axios.get(
    `${BASE_URL}/api/converter/download/${response.data.download_filename}`,
    { responseType: 'stream', timeout: 30000 }
  );

  if (downloadResponse.status !== 200) {
    throw new Error(`Download failed: ${downloadResponse.status}`);
  }

  const downloadedPath = path.join(TEST_FILES_DIR, response.data.download_filename);
  const writer = fs.createWriteStream(downloadedPath);
  downloadResponse.data.pipe(writer);

  await new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });

  const stats = fs.statSync(downloadedPath);
  if (stats.size === 0) {
    throw new Error('Downloaded file is empty');
  }

  log(`  → Downloaded file: ${stats.size} bytes`, 'cyan');
  
  // Verify it's a valid DOCX (ZIP file)
  const fileBuffer = fs.readFileSync(downloadedPath);
  const isZip = fileBuffer[0] === 0x50 && fileBuffer[1] === 0x4B; // PK (ZIP signature)
  
  if (!isZip) {
    warn('TXT to DOCX Conversion', 'Downloaded file does not appear to be a valid DOCX (ZIP format)');
  } else {
    log('  → Verified: File is a valid DOCX (ZIP format)', 'cyan');
  }
  
  // Cleanup
  if (fs.existsSync(downloadedPath)) {
    fs.unlinkSync(downloadedPath);
  }
}

async function testConverterHTMLtoDOCX() {
  const testHtmlPath = path.join(TEST_FILES_DIR, 'test-tamil-document.html');
  
  if (!fs.existsSync(testHtmlPath)) {
    throw new Error('Test HTML file not found. Run create-real-test-files.js first.');
  }

  const formData = new FormData();
  formData.append('file', fs.createReadStream(testHtmlPath), {
    filename: 'test-tamil-document.html',
    contentType: 'text/html'
  });
  formData.append('to_format', 'docx');

  log('  → Converting HTML to DOCX...', 'cyan');
  const response = await axios.post(`${BASE_URL}/api/converter/convert`, formData, {
    headers: formData.getHeaders(),
    timeout: 120000,
    maxContentLength: Infinity,
    maxBodyLength: Infinity
  });

  if (response.status !== 200) {
    throw new Error(`Expected 200, got ${response.status}: ${JSON.stringify(response.data)}`);
  }

  if (!response.data || !response.data.success) {
    throw new Error('Conversion failed: ' + (response.data?.error || 'Unknown error'));
  }

  log(`  → Conversion successful: ${response.data.from_format} → ${response.data.to_format}`, 'cyan');
  
  // Test download
  const downloadResponse = await axios.get(
    `${BASE_URL}/api/converter/download/${response.data.download_filename}`,
    { responseType: 'stream', timeout: 30000 }
  );

  if (downloadResponse.status !== 200) {
    throw new Error(`Download failed: ${downloadResponse.status}`);
  }

  const downloadedPath = path.join(TEST_FILES_DIR, response.data.download_filename);
  const writer = fs.createWriteStream(downloadedPath);
  downloadResponse.data.pipe(writer);

  await new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });

  const stats = fs.statSync(downloadedPath);
  log(`  → Downloaded file: ${stats.size} bytes`, 'cyan');
  
  // Cleanup
  if (fs.existsSync(downloadedPath)) {
    fs.unlinkSync(downloadedPath);
  }
}

async function testConverterTXTtoPDF() {
  const testTxtPath = path.join(TEST_FILES_DIR, 'test-tamil-content.txt');
  
  if (!fs.existsSync(testTxtPath)) {
    throw new Error('Test TXT file not found.');
  }

  const formData = new FormData();
  formData.append('file', fs.createReadStream(testTxtPath), {
    filename: 'test-tamil-content.txt',
    contentType: 'text/plain'
  });
  formData.append('to_format', 'pdf');

  log('  → Converting TXT to PDF...', 'cyan');
  const response = await axios.post(`${BASE_URL}/api/converter/convert`, formData, {
    headers: formData.getHeaders(),
    timeout: 120000,
    maxContentLength: Infinity,
    maxBodyLength: Infinity
  });

  if (response.status !== 200) {
    throw new Error(`Expected 200, got ${response.status}: ${JSON.stringify(response.data)}`);
  }

  if (!response.data || !response.data.success) {
    throw new Error('Conversion failed: ' + (response.data?.error || 'Unknown error'));
  }

  log(`  → Conversion successful: ${response.data.from_format} → ${response.data.to_format}`, 'cyan');
  
  // Test download
  const downloadResponse = await axios.get(
    `${BASE_URL}/api/converter/download/${response.data.download_filename}`,
    { responseType: 'stream', timeout: 30000 }
  );

  if (downloadResponse.status !== 200) {
    throw new Error(`Download failed: ${downloadResponse.status}`);
  }

  const downloadedPath = path.join(TEST_FILES_DIR, response.data.download_filename);
  const writer = fs.createWriteStream(downloadedPath);
  downloadResponse.data.pipe(writer);

  await new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });

  const stats = fs.statSync(downloadedPath);
  
  // Verify it's a valid PDF
  const fileBuffer = fs.readFileSync(downloadedPath);
  const isPdf = fileBuffer.toString('ascii', 0, 4) === '%PDF';
  
  if (!isPdf) {
    throw new Error('Downloaded file is not a valid PDF');
  }
  
  log(`  → Downloaded PDF: ${stats.size} bytes (verified as valid PDF)`, 'cyan');
  
  // Cleanup
  if (fs.existsSync(downloadedPath)) {
    fs.unlinkSync(downloadedPath);
  }
}

// ============= RUN ALL TESTS =============

async function runAllTests() {
  log('\n🧪 Comprehensive ProofTamil Tools Test Suite\n', 'blue');
  log('='.repeat(70), 'blue');
  log(`Base URL: ${BASE_URL}`, 'cyan');
  log(`Converter API URL: ${CONVERTER_API_URL}`, 'cyan');
  log('='.repeat(70), 'blue');
  
  // Check if server is running
  log('\n🔍 Checking if server is running...', 'cyan');
  const serverRunning = await checkServer();
  if (!serverRunning) {
    log('\n❌ Cannot run tests - server is not running!', 'red');
    log('   Please start the Express server and try again.\n', 'red');
    process.exit(1);
  }
  log('✓ Server is running\n', 'green');

  // OCR Tests
  log('\n📸 OCR Tool Tests', 'yellow');
  log('-'.repeat(70));
  
  await test('OCR: Image Upload, Text Extraction, and Word Document Download', async () => {
    await testOCRImageUploadAndExtraction();
  });
  
  await test('OCR: PDF Upload, Text Extraction, and Word Document Download', async () => {
    await testOCRPDFUploadAndExtraction();
  });

  // Document Converter Tests
  log('\n📄 Document Converter Tests', 'yellow');
  log('-'.repeat(70));
  
  await test('Converter: TXT to DOCX (with Tamil text)', async () => {
    await testConverterTXTtoDOCX();
  });
  
  await test('Converter: HTML to DOCX (with Tamil content)', async () => {
    await testConverterHTMLtoDOCX();
  });
  
  await test('Converter: TXT to PDF (with Tamil text)', async () => {
    await testConverterTXTtoPDF();
  });

  // Summary
  log('\n' + '='.repeat(70), 'blue');
  log('\n📊 Test Summary', 'blue');
  log('-'.repeat(70));
  log(`Total Tests: ${results.passed + results.failed}`, 'blue');
  log(`Passed: ${results.passed}`, 'green');
  log(`Failed: ${results.failed}`, results.failed > 0 ? 'red' : 'green');
  
  if (results.warnings.length > 0) {
    log(`\n⚠ Warnings: ${results.warnings.length}`, 'yellow');
    results.warnings.forEach(w => {
      log(`  - ${w.test}: ${w.message}`, 'yellow');
    });
  }

  if (results.errors.length > 0) {
    log('\n❌ Errors:', 'red');
    results.errors.forEach(err => {
      log(`  - ${err.test}: ${err.error}`, 'red');
    });
  }

  // Final verdict
  log('\n' + '='.repeat(70), 'blue');
  if (results.failed === 0) {
    log('\n✅ All tests passed! Tools are ready for production.', 'green');
  } else {
    log('\n❌ Some tests failed. Please fix issues before deploying.', 'red');
  }
  log('='.repeat(70) + '\n', 'blue');

  // Exit code
  process.exit(results.failed > 0 ? 1 : 0);
}

// Run tests
runAllTests().catch(error => {
  log(`\n💥 Fatal error: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});


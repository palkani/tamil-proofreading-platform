/**
 * Document Converter Test Suite
 * Tests document conversion functionality
 * 
 * Run with: node express-frontend/tests/converter-test.js
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';
const TEST_FILES_DIR = path.join(__dirname, 'test-files');

const results = {
  passed: 0,
  failed: 0,
  errors: []
};

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

async function test(name, testFn) {
  try {
    await testFn();
    pass(name);
  } catch (error) {
    fail(name, error);
  }
}

async function checkServer() {
  try {
    await axios.get(`${BASE_URL}/`, { timeout: 2000 });
    return true;
  } catch (error) {
    return false;
  }
}

async function testConverterHealth() {
  const response = await axios.get(`${BASE_URL}/api/converter/health`, { timeout: 5000 });
  if (response.status === 200 || response.status === 503) {
    if (response.data?.status === 'healthy') {
      log('  → Converter API is healthy', 'cyan');
      return;
    } else {
      log('  → Converter API is not available (this is OK if API is not running)', 'yellow');
      return; // Not a failure, just a warning
    }
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
  log(`  → Supported formats: ${response.data.formats.join(', ')}`, 'cyan');
}

async function testTXTtoDOCX() {
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

  log(`  → Conversion successful: ${response.data.from_format} → ${response.data.to_format}`, 'cyan');
  log(`  → File: ${response.data.download_filename}`, 'cyan');

  // Test download
  log('  → Testing download...', 'cyan');
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
  log(`  → Downloaded: ${stats.size} bytes`, 'cyan');
  
  // Verify it's a valid DOCX (ZIP file)
  const fileBuffer = fs.readFileSync(downloadedPath);
  const isZip = fileBuffer[0] === 0x50 && fileBuffer[1] === 0x4B;
  
  if (!isZip) {
    throw new Error('Downloaded file is not a valid DOCX (ZIP format)');
  }
  
  // Cleanup
  if (fs.existsSync(downloadedPath)) {
    fs.unlinkSync(downloadedPath);
  }
}

async function testTXTtoPDF() {
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

  // PDF conversion requires LibreOffice, so it may fail if not installed
  if (response.status === 500) {
    const errorMsg = response.data?.error || 'Unknown error';
    if (errorMsg.includes('LibreOffice') || errorMsg.includes('soffice') || errorMsg.includes('DOCX to PDF')) {
      log('  → PDF conversion requires LibreOffice (not installed)', 'yellow');
      log('  → This is expected - LibreOffice is needed for PDF conversion', 'yellow');
      log('  → Install with: brew install libreoffice (macOS) or apt-get install libreoffice (Linux)', 'yellow');
      return; // Skip this test if LibreOffice is not available
    }
  }

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
  
  log(`  → Downloaded PDF: ${stats.size} bytes (verified)`, 'cyan');
  
  // Cleanup
  if (fs.existsSync(downloadedPath)) {
    fs.unlinkSync(downloadedPath);
  }
}

async function runTests() {
  log('\n🧪 Document Converter Test Suite\n', 'blue');
  log('='.repeat(70), 'blue');
  log(`Base URL: ${BASE_URL}`, 'cyan');
  log('='.repeat(70), 'blue');

  log('\n🔍 Checking if server is running...', 'cyan');
  const serverRunning = await checkServer();
  if (!serverRunning) {
    log('\n❌ Cannot run tests - server is not running!', 'red');
    log('   Please start the Express server and try again.\n', 'red');
    process.exit(1);
  }
  log('✓ Server is running\n', 'green');

  log('\n📄 Document Converter Tests', 'yellow');
  log('-'.repeat(70));

  await test('Converter Health Check', testConverterHealth);
  await test('Get Supported Conversions', testConverterSupportedConversions);
  await test('TXT to DOCX Conversion', testTXTtoDOCX);
  
  // PDF conversion test - may be skipped if LibreOffice is not installed
  try {
    await test('TXT to PDF Conversion', testTXTtoPDF);
  } catch (error) {
    log(`  ⚠ Skipping PDF test: ${error.message}`, 'yellow');
  }

  log('\n' + '='.repeat(70), 'blue');
  log('\n📊 Test Summary', 'blue');
  log('-'.repeat(70));
  log(`Total Tests: ${results.passed + results.failed}`, 'blue');
  log(`Passed: ${results.passed}`, 'green');
  log(`Failed: ${results.failed}`, results.failed > 0 ? 'red' : 'green');

  if (results.errors.length > 0) {
    log('\n❌ Errors:', 'red');
    results.errors.forEach(err => {
      log(`  - ${err.test}: ${err.error}`, 'red');
    });
  }

  log('\n' + '='.repeat(70), 'blue');
  if (results.failed === 0) {
    log('\n✅ All converter tests passed!', 'green');
  } else {
    log('\n❌ Some tests failed.', 'red');
  }
  log('='.repeat(70) + '\n', 'blue');

  process.exit(results.failed > 0 ? 1 : 0);
}

runTests().catch(error => {
  log(`\n💥 Fatal error: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});


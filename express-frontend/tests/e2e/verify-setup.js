/**
 * Verify E2E Test Setup
 * Quick check to ensure all dependencies and setup are correct
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function checkPuppeteer() {
  try {
    require('puppeteer');
    log('✓ Puppeteer is installed', 'green');
    return true;
  } catch (error) {
    log('✗ Puppeteer is not installed', 'red');
    log('  Run: npm install puppeteer --save-dev', 'yellow');
    return false;
  }
}

async function checkServer() {
  return new Promise((resolve) => {
    const req = http.get('http://localhost:3000', (res) => {
      log('✓ Express server is running on http://localhost:3000', 'green');
      resolve(true);
    });

    req.on('error', (error) => {
      log('✗ Express server is not running', 'red');
      log('  Run: cd express-frontend && npm start', 'yellow');
      resolve(false);
    });

    req.setTimeout(3000, () => {
      req.destroy();
      log('✗ Express server is not responding', 'red');
      resolve(false);
    });
  });
}

function checkTestFiles() {
  const testFiles = [
    'test-setup.js',
    'comprehensive.test.js',
    'drafts.test.js',
    'editor.test.js',
    'run-all-tests.js',
  ];

  const baseDir = __dirname;
  let allExist = true;

  testFiles.forEach(file => {
    const filePath = path.join(baseDir, file);
    if (fs.existsSync(filePath)) {
      log(`✓ ${file} exists`, 'green');
    } else {
      log(`✗ ${file} is missing`, 'red');
      allExist = false;
    }
  });

  return allExist;
}

function checkScreenshotsDir() {
  const screenshotsDir = path.join(__dirname, 'screenshots');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
    log('✓ Created screenshots directory', 'green');
  } else {
    log('✓ Screenshots directory exists', 'green');
  }
  return true;
}

async function main() {
  log('\n🔍 Verifying E2E Test Setup', 'blue');
  log('='.repeat(70), 'blue');

  const results = {
    puppeteer: await checkPuppeteer(),
    server: await checkServer(),
    testFiles: checkTestFiles(),
    screenshots: checkScreenshotsDir(),
  };

  log('\n' + '='.repeat(70), 'blue');
  log('\n📊 Setup Verification Summary', 'blue');
  log('-'.repeat(70), 'blue');

  const allPassed = Object.values(results).every(v => v === true);

  if (allPassed) {
    log('\n✅ All checks passed! You can run tests now:', 'green');
    log('  npm run test:e2e', 'cyan');
    log('  npm run test:e2e:headed  (to see browser)', 'cyan');
    log('  npm run test:e2e:debug   (slow motion)', 'cyan');
    process.exit(0);
  } else {
    log('\n❌ Some checks failed. Please fix issues above before running tests.', 'red');
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(error => {
    log(`\n💥 Fatal error: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
  });
}

module.exports = { checkPuppeteer, checkServer, checkTestFiles, checkScreenshotsDir };


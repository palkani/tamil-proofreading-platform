/**
 * E2E Tests for Paste Functionality in Workspace Editor
 */

const puppeteer = require('puppeteer');

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';
const HEADLESS = process.env.HEADLESS !== 'false';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function log(message, color = 'reset') {
  const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
  };
  console.log(`${colors[color] || colors.reset}${message}${colors.reset}`);
}

async function test(name, fn) {
  try {
    log(`\n🧪 Testing: ${name}`, 'blue');
    await fn();
    log(`✓ ${name}`, 'green');
  } catch (error) {
    log(`✗ ${name}: ${error.message}`, 'red');
    throw error;
  }
}

async function runPasteTests() {
  console.log('\n📋 Paste Functionality E2E Tests');
  console.log('======================================================================');
  
  console.log(`Base URL: ${BASE_URL}`);
  console.log('======================================================================\n');

  await test('Server is running', async () => {
    try {
      const response = await fetch(BASE_URL);
      if (!response.ok) {
        throw new Error('Server is not running');
      }
    } catch (error) {
      throw new Error(`Server is not running: ${error.message}`);
    }
  });

  let browser, page;

  await test('Launch browser', async () => {
    browser = await puppeteer.launch({
      headless: HEADLESS,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    page = await browser.newPage();
    
    // Monitor console logs
    page.on('console', (msg) => {
      const text = msg.text();
      if (text.includes('Paste') || text.includes('autoAnalyze') || text.includes('AI') || text.includes('📋')) {
        log(`  📝 Console: ${text}`, 'cyan');
      }
    });
    
    log('✅ Browser launched', 'green');
  });

  try {
    await test('Navigate to workspace page', async () => {
      log(`📍 Navigating to: ${BASE_URL}/workspace`, 'blue');
      await page.goto(`${BASE_URL}/workspace`, { waitUntil: 'networkidle2', timeout: 30000 });
      await sleep(3000);
      
      const url = page.url();
      if (url.includes('login')) {
        log('  ⚠️ Redirected to login - paste test requires authentication', 'yellow');
        log('  ℹ️ Please log in manually and run test again', 'yellow');
        return;
      }
    });

    await test('Find and focus editor element', async () => {
      const editor = await page.$('#editor');
      if (!editor) {
        throw new Error('Editor element (#editor) not found');
      }
      
      await editor.click();
      await sleep(500);
      
      // Check if editor is focused
      const isFocused = await page.evaluate(() => {
        const el = document.getElementById('editor');
        return el === document.activeElement;
      });
      
      if (!isFocused) {
        log('  ⚠️ Editor may not be focused', 'yellow');
      }
      
      log('✅ Editor found and clicked', 'green');
    });

    await test('Paste Tamil text and check for API calls', async () => {
      const tamilText = 'விஜய் இன்று சிபிஐ முன்பு ஆஜராக உள்ளார். இது தேசிய அளவில் கவனத்தை பெற்று வருகிறது. கரூர் வழக்கு தொடர்பாக நடத்தப்படும் இந்த விசாரணையானது எந்த மாதிரியான தாக்கத்தை அரசியல் களத்தில் விஜய்க்கு பெற்றுத்தரும்?';
      
      log(`  📋 Preparing to paste text (${tamilText.length} chars)`, 'blue');
      
      // Monitor network requests
      const apiRequests = [];
      page.on('request', (request) => {
        const url = request.url();
        if (url.includes('/api/submit') || url.includes('/api/v1/submissions')) {
          apiRequests.push({
            url: url,
            method: request.method(),
            timestamp: Date.now()
          });
          log(`  🌐 API Request: ${request.method()} ${url}`, 'green');
        }
      });

      // Set clipboard content
      await page.evaluate((text) => {
        // Create a temporary textarea to set clipboard
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }, tamilText);

      await sleep(500);

      // Click editor to ensure focus
      await page.click('#editor');
      await sleep(300);

      // Clear editor first
      await page.keyboard.down('Meta'); // Cmd on Mac
      await page.keyboard.press('a');
      await page.keyboard.up('Meta');
      await page.keyboard.press('Backspace');
      await sleep(300);

      log('  📋 Attempting paste with Cmd+V / Ctrl+V', 'blue');
      
      // Paste using keyboard shortcut
      const isMac = process.platform === 'darwin';
      await page.keyboard.down(isMac ? 'Meta' : 'Control');
      await page.keyboard.press('v');
      await page.keyboard.up(isMac ? 'Meta' : 'Control');
      
      await sleep(2000);

      // Verify text was pasted
      const pastedContent = await page.evaluate(() => {
        const el = document.getElementById('editor');
        if (!el) return null;
        return el.textContent || el.innerText || '';
      });

      log(`  📋 Editor content length: ${pastedContent ? pastedContent.length : 0}`, 'blue');
      log(`  📋 Editor content preview: ${pastedContent ? pastedContent.substring(0, 100) : 'null'}`, 'blue');

      if (!pastedContent || pastedContent.length < 10) {
        throw new Error(`Text was not pasted. Content length: ${pastedContent ? pastedContent.length : 0}`);
      }

      // Check if Tamil text is in editor
      const hasTamil = /[\u0B80-\u0BFF]/.test(pastedContent);
      if (!hasTamil) {
        throw new Error('Pasted text does not contain Tamil characters');
      }

      log(`  ✅ Tamil text pasted successfully (${pastedContent.length} chars)`, 'green');

      // Wait for API call (autoAnalyze should trigger after paste)
      log('  ⏳ Waiting for AI analysis API call...', 'blue');
      await sleep(4000);

      log(`  📊 API requests captured: ${apiRequests.length}`, 'blue');
      
      if (apiRequests.length > 0) {
        log(`  ✅ API call detected!`, 'green');
        apiRequests.forEach((req, i) => {
          log(`    ${i + 1}. ${req.method()} ${req.url}`, 'green');
        });
      } else {
        log(`  ⚠️ No API calls detected after paste`, 'yellow');
        log(`  ℹ️ This might indicate the paste handler is not triggering autoAnalyze()`, 'yellow');
      }
    });

    await test('Check AI suggestions panel', async () => {
      const panel = await page.$('#ai-assistant-panel, #suggestions-container');
      if (!panel) {
        log('  ⚠️ AI suggestions panel not found', 'yellow');
      } else {
        log('  ✅ AI suggestions panel exists', 'green');
      }
    });

  } finally {
    if (browser) {
      await browser.close();
      log('✅ Browser closed', 'green');
    }
  }

  console.log('\n======================================================================');
  console.log('📊 Paste Test Summary');
  console.log('----------------------------------------------------------------------');
  console.log('✅ Paste functionality test completed');
  console.log('======================================================================\n');
}

// Run tests if executed directly
if (require.main === module) {
  runPasteTests().catch(error => {
    console.error('❌ Test suite failed:', error);
    process.exit(1);
  });
}

module.exports = { runPasteTests };

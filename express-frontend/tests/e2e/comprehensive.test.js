/**
 * Comprehensive E2E Test Suite
 * Tests all pages, navigation, editors, and drafts functionality
 */

const {
  initBrowser,
  closeBrowser,
  navigateTo,
  waitForElement,
  waitForNavigation,
  checkServer,
  getPage,
  takeScreenshot,
  BASE_URL,
} = require('./test-setup');

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

const testResults = {
  passed: 0,
  failed: 0,
  errors: [],
};

async function test(name, testFn) {
  try {
    log(`\n🧪 Testing: ${name}`, 'cyan');
    await testFn();
    testResults.passed++;
    log(`✓ ${name}`, 'green');
  } catch (error) {
    testResults.failed++;
    testResults.errors.push({ test: name, error: error.message });
    log(`✗ ${name}: ${error.message}`, 'red');
    if (process.env.DEBUG) {
      console.error(error.stack);
    }
  }
}

/**
 * Wait for a specified amount of time
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Type text into an element
 */
async function typeText(page, selector, text, options = {}) {
  await waitForElement(selector);
  await page.click(selector);
  await sleep(100);
  
  if (options.clear !== false) {
    await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (el) {
        if (el.contentEditable === 'true' || el.isContentEditable) {
          el.textContent = '';
        } else {
          el.value = '';
        }
      }
    }, selector);
  }
  
  await page.type(selector, text, { delay: options.delay || 10 });
  await sleep(200);
}

/**
 * Get text content from an element
 */
async function getText(page, selector) {
  return await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return '';
    
    if (el.contentEditable === 'true' || el.isContentEditable) {
      return el.textContent || el.innerText || '';
    }
    return el.value || el.textContent || '';
  }, selector);
}

/**
 * Check if element exists
 */
async function elementExists(page, selector) {
  return await page.$(selector) !== null;
}

// ============= TEST SUITE =============

async function runTests() {
  log('\n🧪 Comprehensive E2E Test Suite', 'blue');
  log('='.repeat(70), 'blue');
  log(`Base URL: ${BASE_URL}`, 'cyan');
  log('='.repeat(70), 'blue');

  // Check server
  log('\n🔍 Checking if server is running...', 'cyan');
  const serverRunning = await checkServer();
  if (!serverRunning) {
    log('\n❌ Server is not running!', 'red');
    log('   Please start the Express server first:', 'yellow');
    log('   cd express-frontend && npm start', 'yellow');
    process.exit(1);
  }
  log('✓ Server is running\n', 'green');

  await initBrowser();

  // ============= HOME PAGE TESTS =============
  
  await test('Home page loads correctly', async () => {
    const page = await navigateTo('/');
    await waitForElement('nav');
    const title = await page.title();
    if (!title || title.toLowerCase().includes('error')) {
      throw new Error(`Invalid page title: ${title}`);
    }
  });

  await test('Home page has navigation bar', async () => {
    const page = await getPage();
    const nav = await page.$('nav');
    if (!nav) {
      throw new Error('Navigation bar not found');
    }
  });

  await test('Home page has logo', async () => {
    const page = await getPage();
    const logo = await page.$('nav img, nav svg, nav a[href="/"]');
    if (!logo) {
      throw new Error('Logo not found');
    }
  });

  await test('Home page editor is accessible', async () => {
    const page = await navigateTo('/');
    
    // Look for editor elements (could be contenteditable, textarea, or iframe)
    const editor = await page.$('#editor, [contenteditable="true"], textarea[name*="text"], iframe');
    
    if (!editor) {
      // Check if editor exists with different selectors
      const hasEditor = await page.evaluate(() => {
        return !!(
          document.getElementById('editor') ||
          document.querySelector('[contenteditable="true"]') ||
          document.querySelector('textarea')
        );
      });
      
      if (!hasEditor) {
        throw new Error('Editor not found on home page');
      }
    }
  });

  await test('Home page editor accepts text input', async () => {
    const page = await navigateTo('/');
    
    // Try different editor selectors
    const selectors = ['#editor', '[contenteditable="true"]', 'textarea'];
    let editorFound = false;
    
    for (const selector of selectors) {
      const editor = await page.$(selector);
      if (editor) {
        editorFound = true;
        await editor.click();
        await sleep(200);
        
        // Type test text
        const testText = 'Test text for home editor';
        await page.keyboard.type(testText);
        await sleep(500);
        
        // Verify text was entered
        const text = await getText(page, selector);
        if (!text.includes('Test text')) {
          throw new Error('Text was not entered into editor');
        }
        
        break;
      }
    }
    
    if (!editorFound) {
      throw new Error('No editor element found to test');
    }
  });

  await test('Home page has Tamil text sample or placeholder', async () => {
    const page = await navigateTo('/');
    await sleep(1000); // Wait for content to load
    
    const pageText = await page.evaluate(() => document.body.innerText);
    
    // Check for Tamil characters or placeholder text
    const hasTamil = /[\u0B80-\u0BFF]/.test(pageText);
    const hasPlaceholder = pageText.toLowerCase().includes('type') || 
                          pageText.toLowerCase().includes('paste') ||
                          pageText.toLowerCase().includes('enter');
    
    // This is optional, so we just log it
    if (!hasTamil && !hasPlaceholder) {
      log('  ⚠️ No Tamil text or placeholder found (this is OK)', 'yellow');
    }
  });

  // ============= NAVIGATION TESTS =============

  await test('Logo link navigates to home', async () => {
    const page = await navigateTo('/contact');
    const logo = await page.$('nav a[href="/"], nav img');
    
    if (logo) {
      await logo.click();
      await waitForNavigation();
      const url = page.url();
      if (!url.includes(BASE_URL) || (!url.endsWith('/') && !url.endsWith(BASE_URL))) {
        throw new Error(`Logo did not navigate to home: ${url}`);
      }
    }
  });

  await test('Contact page loads', async () => {
    const page = await navigateTo('/contact');
    await waitForElement('body');
    const title = await page.title();
    if (!title || title.toLowerCase().includes('error')) {
      throw new Error(`Contact page did not load: ${title}`);
    }
  });

  await test('How to Use page loads', async () => {
    const page = await navigateTo('/how-to-use');
    await waitForElement('body');
    const title = await page.title();
    if (!title || title.toLowerCase().includes('error')) {
      throw new Error(`How to Use page did not load: ${title}`);
    }
  });

  // ============= WORKSPACE PAGE TESTS =============

  await test('Workspace page loads (or redirects to login)', async () => {
    const page = await navigateTo('/workspace');
    await sleep(2000);
    
    const url = page.url();
    const content = await page.content();
    
    // Check if we're on workspace or redirected to login
    const isWorkspace = url.includes('workspace');
    const isLogin = url.includes('login') || content.includes('Sign in') || content.includes('login');
    const hasEditor = await elementExists(page, '#editor, [contenteditable="true"], textarea');
    
    if (!isWorkspace && !isLogin && !hasEditor) {
      throw new Error('Workspace page did not load and no redirect occurred');
    }
  });

  await test('Workspace editor is accessible (if logged in)', async () => {
    const page = await navigateTo('/workspace');
    await sleep(2000);
    
    const url = page.url();
    
    // Only test if we're actually on workspace page
    if (url.includes('workspace') && !url.includes('login')) {
      const editor = await page.$('#editor, [contenteditable="true"], textarea');
      if (!editor) {
        throw new Error('Editor not found on workspace page');
      }
    } else {
      log('  ⚠️ Skipping - not logged in (this is OK)', 'yellow');
    }
  });

  await test('Workspace editor accepts text input (if logged in)', async () => {
    const page = await navigateTo('/workspace');
    await sleep(2000);
    
    const url = page.url();
    
    if (url.includes('workspace') && !url.includes('login')) {
      const editor = await page.$('#editor, [contenteditable="true"], textarea');
      
      if (editor) {
        await editor.click();
        await sleep(200);
        
        // Type Tamil test text
        const testText = 'வணக்கம்';
        await page.keyboard.type(testText);
        await sleep(500);
        
        // Verify text was entered
        const text = await getText(page, '#editor, [contenteditable="true"], textarea');
        if (!text.includes('வணக்கம்')) {
          throw new Error('Tamil text was not entered into workspace editor');
        }
      } else {
        throw new Error('Editor not found');
      }
    } else {
      log('  ⚠️ Skipping - not logged in (this is OK)', 'yellow');
    }
  });

  // ============= DRAFTS PAGE TESTS =============

  await test('Drafts page loads (or redirects to login)', async () => {
    const page = await navigateTo('/drafts');
    await sleep(2000);
    
    const url = page.url();
    const content = await page.content();
    
    const isDrafts = url.includes('drafts');
    const isLogin = url.includes('login') || content.includes('Sign in');
    const hasDraftsContent = content.includes('Draft') || await elementExists(page, '[id*="draft"], [class*="draft"]');
    
    if (!isDrafts && !isLogin && !hasDraftsContent) {
      throw new Error('Drafts page did not load and no redirect occurred');
    }
  });

  await test('Drafts page shows "Create New Draft" button (if logged in)', async () => {
    const page = await navigateTo('/drafts');
    await sleep(2000);
    
    const url = page.url();
    
    if (url.includes('drafts') && !url.includes('login')) {
      // Use evaluate to find button by text content
      const buttonHandle = await page.evaluateHandle(() => {
        const buttons = Array.from(document.querySelectorAll('button, a'));
        return buttons.find(el => {
          const text = el.textContent.toLowerCase();
          return text.includes('new draft') || text.includes('create');
        }) || null;
      });
      const button = await buttonHandle.jsonValue();
      
      if (!button) {
        // Check with evaluate for case-insensitive match
        const hasButton = await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('button, a'));
          return buttons.some(el => 
            el.textContent.toLowerCase().includes('new draft') ||
            el.textContent.toLowerCase().includes('create')
          );
        });
        
        if (!hasButton) {
          throw new Error('Create New Draft button not found');
        }
      }
    } else {
      log('  ⚠️ Skipping - not logged in (this is OK)', 'yellow');
    }
  });

  // ============= TOOLS PAGE TESTS =============

  await test('OCR tool page loads', async () => {
    const page = await navigateTo('/tools/ocr');
    await sleep(1000);
    
    const url = page.url();
    const content = await page.content();
    
    const isOcr = url.includes('ocr') || content.includes('OCR') || content.includes('Extract');
    
    if (!isOcr) {
      throw new Error('OCR tool page did not load');
    }
  });

  await test('Document Converter page loads', async () => {
    const page = await navigateTo('/tools/converter');
    await sleep(1000);
    
    const url = page.url();
    const content = await page.content();
    
    const isConverter = url.includes('converter') || content.includes('Convert') || content.includes('Document');
    
    if (!isConverter) {
      throw new Error('Document Converter page did not load');
    }
  });

  // ============= RESPONSIVE TESTS =============

  await test('Page is responsive on mobile viewport', async () => {
    const page = await navigateTo('/');
    await page.setViewport({ width: 375, height: 667 }); // iPhone size
    await sleep(500);
    
    const nav = await page.$('nav');
    if (!nav) {
      throw new Error('Navigation not found on mobile viewport');
    }
  });

  // ============= FINAL SUMMARY =============

  await closeBrowser();

  log('\n' + '='.repeat(70), 'blue');
  log('\n📊 Test Summary', 'blue');
  log('-'.repeat(70), 'blue');
  log(`Total Tests: ${testResults.passed + testResults.failed}`, 'blue');
  log(`Passed: ${testResults.passed}`, 'green');
  log(`Failed: ${testResults.failed}`, testResults.failed > 0 ? 'red' : 'green');

  if (testResults.errors.length > 0) {
    log('\n❌ Errors:', 'red');
    testResults.errors.forEach(err => {
      log(`  - ${err.test}: ${err.error}`, 'red');
    });
  }

  log('\n' + '='.repeat(70), 'blue');
  
  if (testResults.failed === 0) {
    log('\n✅ All tests passed!', 'green');
    process.exit(0);
  } else {
    log('\n❌ Some tests failed.', 'red');
    process.exit(1);
  }
}

// Run tests if executed directly
if (require.main === module) {
  runTests().catch(error => {
    log(`\n💥 Fatal error: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
  });
}

module.exports = { runTests };


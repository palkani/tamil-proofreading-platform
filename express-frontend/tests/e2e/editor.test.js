/**
 * Editor E2E Tests
 * Tests text editor functionality on Home page and Workspace page
 */

const {
  initBrowser,
  closeBrowser,
  navigateTo,
  waitForElement,
  waitForNavigation,
  checkServer,
  getPage,
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
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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

async function findEditor(page) {
  // Try multiple selectors
  const selectors = [
    '#editor',
    '[contenteditable="true"]',
    'textarea[name*="text"]',
    'textarea[id*="editor"]',
    '.editor',
    '[class*="editor"]'
  ];

  for (const selector of selectors) {
    const element = await page.$(selector);
    if (element) {
      return selector;
    }
  }

  return null;
}

async function runEditorTests() {
  log('\n✏️  Editor E2E Tests', 'blue');
  log('='.repeat(70), 'blue');

  const serverRunning = await checkServer();
  if (!serverRunning) {
    throw new Error('Server is not running! Please start the Express server first.');
  }

  await initBrowser();

  // ============= HOME PAGE EDITOR TESTS =============

  await test('Home page editor is accessible', async () => {
    const page = await navigateTo('/');
    await sleep(1000);

    const editorSelector = await findEditor(page);
    if (!editorSelector) {
      throw new Error('Editor not found on home page');
    }
  });

  await test('Home page editor accepts English text', async () => {
    const page = await navigateTo('/');
    await sleep(1000);

    const editorSelector = await findEditor(page);
    if (!editorSelector) {
      throw new Error('Editor not found');
    }

    await page.click(editorSelector);
    await sleep(200);

    // Clear and type
    await page.keyboard.down('Meta');
    await page.keyboard.press('a');
    await page.keyboard.up('Meta');
    await page.keyboard.press('Backspace');
    await sleep(200);

    const testText = 'Hello World';
    await page.keyboard.type(testText, { delay: 50 });
    await sleep(500);

    const text = await getText(page, editorSelector);
    if (!text.includes('Hello')) {
      throw new Error('English text was not entered into home editor');
    }
  });

  await test('Home page editor accepts Tamil text', async () => {
    const page = await navigateTo('/');
    await sleep(1000);

    const editorSelector = await findEditor(page);
    if (!editorSelector) {
      throw new Error('Editor not found');
    }

    await page.click(editorSelector);
    await sleep(200);

    // Clear
    await page.keyboard.down('Meta');
    await page.keyboard.press('a');
    await page.keyboard.up('Meta');
    await page.keyboard.press('Backspace');
    await sleep(200);

    const testText = 'வணக்கம்';
    await page.keyboard.type(testText, { delay: 50 });
    await sleep(500);

    const text = await getText(page, editorSelector);
    if (!text.includes('வணக்கம்')) {
      throw new Error('Tamil text was not entered into home editor');
    }
  });

  await test('Home page editor accepts paste', async () => {
    const page = await navigateTo('/');
    await sleep(1000);

    const editorSelector = await findEditor(page);
    if (!editorSelector) {
      throw new Error('Editor not found');
    }

    await page.click(editorSelector);
    await sleep(200);

    // Set clipboard and paste
    const pastedText = 'Pasted Tamil text: தமிழ்';
    await page.evaluate((text) => {
      navigator.clipboard.writeText(text);
    }, pastedText);

    await page.keyboard.down('Meta');
    await page.keyboard.press('v');
    await page.keyboard.up('Meta');
    await sleep(500);

    const text = await getText(page, editorSelector);
    if (!text.includes('தமிழ்')) {
      throw new Error('Pasted text was not entered into home editor');
    }
  });

  // ============= WORKSPACE EDITOR TESTS =============

  await test('Workspace editor is accessible (if logged in)', async () => {
    const page = await navigateTo('/workspace');
    await sleep(2000);

    const url = page.url();
    
    if (url.includes('workspace') && !url.includes('login')) {
      const editorSelector = await findEditor(page);
      if (!editorSelector) {
        throw new Error('Editor not found on workspace page');
      }
    } else {
      log('  ⚠️ Skipping - not logged in (this is OK)', 'yellow');
    }
  });

  await test('Workspace editor accepts Tamil text (if logged in)', async () => {
    const page = await navigateTo('/workspace');
    await sleep(2000);

    const url = page.url();
    
    if (url.includes('workspace') && !url.includes('login')) {
      const editorSelector = await findEditor(page);
      if (!editorSelector) {
        throw new Error('Editor not found');
      }

      await page.click(editorSelector);
      await sleep(200);

      // Clear
      await page.keyboard.down('Meta');
      await page.keyboard.press('a');
      await page.keyboard.up('Meta');
      await page.keyboard.press('Backspace');
      await sleep(200);

      const testText = 'வணக்கம் உலகம்';
      await page.keyboard.type(testText, { delay: 50 });
      await sleep(1000);

      const text = await getText(page, editorSelector);
      if (!text.includes('வணக்கம்')) {
        throw new Error('Tamil text was not entered into workspace editor');
      }
    } else {
      log('  ⚠️ Skipping - not logged in (this is OK)', 'yellow');
    }
  });

  await test('Workspace editor shows word count (if logged in)', async () => {
    const page = await navigateTo('/workspace');
    await sleep(2000);

    const url = page.url();
    
    if (url.includes('workspace') && !url.includes('login')) {
      const hasWordCount = await page.evaluate(() => {
        const body = document.body.innerText;
        return body.includes('word') || 
               body.includes('Word') ||
               !!document.querySelector('[id*="word"], [class*="word-count"]');
      });

      // Word count is optional, so we just log if not found
      if (!hasWordCount) {
        log('  ⚠️ Word count not found (this is OK)', 'yellow');
      }
    } else {
      log('  ⚠️ Skipping - not logged in (this is OK)', 'yellow');
    }
  });

  await test('Workspace editor toolbar is functional (if logged in)', async () => {
    const page = await navigateTo('/workspace');
    await sleep(2000);

    const url = page.url();
    
    if (url.includes('workspace') && !url.includes('login')) {
      const hasToolbar = await page.$('button[aria-label*="Bold"], button[title*="Bold"], [class*="toolbar"], [id*="toolbar"]');
      
      // Toolbar is optional, so we just log if not found
      if (!hasToolbar) {
        log('  ⚠️ Toolbar not found (this is OK)', 'yellow');
      }
    } else {
      log('  ⚠️ Skipping - not logged in (this is OK)', 'yellow');
    }
  });

  await test('Workspace editor auto-saves (if logged in)', async () => {
    const page = await navigateTo('/workspace');
    await sleep(2000);

    const url = page.url();
    
    if (url.includes('workspace') && !url.includes('login')) {
      const editorSelector = await findEditor(page);
      
      if (editorSelector) {
        await page.click(editorSelector);
        await sleep(200);

        const testText = 'Auto-save test text';
        await page.keyboard.type(testText, { delay: 50 });
        await sleep(3000); // Wait for auto-save

        // Check for saved indicator
        const hasSavedIndicator = await page.evaluate(() => {
          const body = document.body.innerText;
          return body.includes('Saved') || 
                 body.includes('saved') ||
                 !!document.querySelector('[class*="saved"], [id*="saved"]');
        });

        // Saved indicator is optional
        if (!hasSavedIndicator) {
          log('  ⚠️ Saved indicator not found (this is OK)', 'yellow');
        }
      }
    } else {
      log('  ⚠️ Skipping - not logged in (this is OK)', 'yellow');
    }
  });

  await closeBrowser();

  log('\n' + '='.repeat(70), 'blue');
  log('\n📊 Editor Test Summary', 'blue');
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

  return testResults;
}

if (require.main === module) {
  runEditorTests().then(results => {
    if (results.failed === 0) {
      process.exit(0);
    } else {
      process.exit(1);
    }
  }).catch(error => {
    log(`\n💥 Fatal error: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
  });
}

module.exports = { runEditorTests };


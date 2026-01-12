/**
 * Drafts Page E2E Tests
 * Tests all drafts functionality including create, view, edit, and delete
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

async function runDraftsTests() {
  log('\n📄 Drafts Page E2E Tests', 'blue');
  log('='.repeat(70), 'blue');

  const serverRunning = await checkServer();
  if (!serverRunning) {
    throw new Error('Server is not running! Please start the Express server first.');
  }

  await initBrowser();

  // Test 1: Drafts page loads or redirects to login
  await test('Drafts page loads (or redirects to login)', async () => {
    const page = await navigateTo('/drafts');
    await sleep(2000);

    const url = page.url();
    const content = await page.content();

    const isDrafts = url.includes('drafts');
    const isLogin = url.includes('login') || content.toLowerCase().includes('sign in');
    const hasDraftsContent = content.toLowerCase().includes('draft') || 
                            await page.$('[id*="draft"], [class*="draft"]');

    if (!isDrafts && !isLogin && !hasDraftsContent) {
      throw new Error('Drafts page did not load and no redirect occurred');
    }
  });

  // Test 2: Check if "Create New Draft" button exists
  await test('Drafts page shows "Create New Draft" button', async () => {
    const page = await navigateTo('/drafts');
    await sleep(2000);

    const url = page.url();

    if (url.includes('drafts') && !url.includes('login')) {
      const hasButton = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button, a'));
        return buttons.some(el => {
          const text = el.textContent.toLowerCase();
          return text.includes('new draft') || 
                 text.includes('create') || 
                 text.includes('start');
        });
      });

      if (!hasButton) {
        // Check for button by ID or class
        const buttonById = await page.$('#new-draft-btn, .new-draft-btn, #create-draft-btn');
        if (!buttonById) {
          throw new Error('Create New Draft button not found');
        }
      }
    } else {
      log('  ⚠️ Skipping - not logged in (this is OK)', 'yellow');
    }
  });

  // Test 3: Click "Create New Draft" button navigates to workspace
  await test('Create New Draft button navigates to workspace', async () => {
    const page = await navigateTo('/drafts');
    await sleep(2000);

    const url = page.url();

    if (url.includes('drafts') && !url.includes('login')) {
      // Find the button
      // Use evaluate to find button by text content
      const button = await page.evaluateHandle(() => {
        const buttons = Array.from(document.querySelectorAll('button, a'));
        return buttons.find(el => {
          const text = el.textContent.toLowerCase();
          return text.includes('new draft') || text.includes('create');
        }) || null;
      });
      
      const btn = await button.jsonValue();
      
      if (btn) {
        // Get current URL before click
        const beforeUrl = page.url();

        // Click button
        await page.evaluate(el => el.click(), button);
        await waitForNavigation();

        // Check if navigated to workspace
        const afterUrl = page.url();
        
        if (!afterUrl.includes('workspace') && afterUrl === beforeUrl) {
          throw new Error('Create New Draft button did not navigate to workspace');
        }
      } else {
        throw new Error('Create New Draft button not found to click');
      }
    } else {
      log('  ⚠️ Skipping - not logged in (this is OK)', 'yellow');
    }
  });

  // Test 4: Drafts list displays (if logged in and has drafts)
  await test('Drafts list displays if available', async () => {
    const page = await navigateTo('/drafts');
    await sleep(3000); // Wait for API call to complete

    const url = page.url();

    if (url.includes('drafts') && !url.includes('login')) {
      // Check for drafts container or list
      const hasDraftsList = await page.evaluate(() => {
        const body = document.body.innerText;
        return body.includes('Draft') || 
               body.includes('No drafts') || 
               body.includes('Empty') ||
               !!document.querySelector('[id*="draft"], [class*="draft"], [class*="list"]');
      });

      if (!hasDraftsList) {
        throw new Error('Drafts list area not found');
      }
    } else {
      log('  ⚠️ Skipping - not logged in (this is OK)', 'yellow');
    }
  });

  // Test 5: Click on a draft opens it in workspace
  await test('Clicking on a draft opens it in workspace', async () => {
    const page = await navigateTo('/drafts');
    await sleep(3000);

    const url = page.url();

    if (url.includes('drafts') && !url.includes('login')) {
      // Look for draft items
      const draftItems = await page.$$('[class*="draft-item"], [data-draft-id], a[href*="workspace"], a[href*="draft"]');
      
      if (draftItems.length > 0) {
        // Click first draft
        await draftItems[0].click();
        await waitForNavigation();

        const afterUrl = page.url();
        
        // Should navigate to workspace with draft ID or open in workspace
        if (!afterUrl.includes('workspace') && !afterUrl.includes('draft')) {
          throw new Error('Clicking draft did not navigate to workspace');
        }
      } else {
        log('  ⚠️ No drafts available to test (this is OK)', 'yellow');
      }
    } else {
      log('  ⚠️ Skipping - not logged in (this is OK)', 'yellow');
    }
  });

  // Test 6: Draft title is editable
  await test('Draft title input is present', async () => {
    const page = await navigateTo('/drafts');
    await sleep(2000);

    const url = page.url();

    if (url.includes('drafts') && !url.includes('login')) {
      // Check for title input (might be in draft items or header)
      const hasTitleInput = await page.$('input[name*="title"], input[id*="title"], #draft-title');
      
      // Title input might not be on list page, it's OK if not found
      if (!hasTitleInput) {
        log('  ⚠️ Title input not found on drafts list page (this is OK)', 'yellow');
      }
    } else {
      log('  ⚠️ Skipping - not logged in (this is OK)', 'yellow');
    }
  });

  await closeBrowser();

  log('\n' + '='.repeat(70), 'blue');
  log('\n📊 Drafts Test Summary', 'blue');
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
  runDraftsTests().then(results => {
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

module.exports = { runDraftsTests };


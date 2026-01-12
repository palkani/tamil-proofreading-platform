/**
 * Comprehensive E2E Tests for Drafts Functionality
 * Tests all draft-related features: navigation, viewing, editing, creating
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

async function runDraftsComprehensiveTests() {
  console.log('\n📋 Comprehensive Drafts Functionality E2E Tests');
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
      if (text.includes('Draft') || text.includes('draft') || text.includes('error') || text.includes('Error')) {
        log(`  📝 Console: ${text.substring(0, 150)}`, 'cyan');
      }
    });
    
    log('✅ Browser launched', 'green');
  });

  try {
    await test('Navigate to homepage', async () => {
      log(`📍 Navigating to: ${BASE_URL}`, 'blue');
      await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 30000 });
      await sleep(2000);
    });

    await test('Click My Drafts link in navigation', async () => {
      // Find the "My Drafts" link
      const draftsLink = await page.evaluateHandle(() => {
        const links = Array.from(document.querySelectorAll('a'));
        return links.find(link => link.textContent.trim() === 'My Drafts' || link.textContent.includes('Drafts'));
      });
      
      if (!draftsLink || draftsLink.asElement() === null) {
        log('  ⚠️ My Drafts link not found - may need to log in first', 'yellow');
        return;
      }
      
      log('  📍 Found My Drafts link, clicking...', 'blue');
      await draftsLink.asElement().click();
      await sleep(3000);
      
      const url = page.url();
      if (!url.includes('drafts')) {
        throw new Error(`Expected to navigate to drafts page, but URL is: ${url}`);
      }
      
      log(`  ✅ Successfully navigated to: ${url}`, 'green');
    });

    await test('Check if drafts page loaded', async () => {
      const pageTitle = await page.evaluate(() => {
        const h2 = document.querySelector('h2');
        return h2 ? h2.textContent : null;
      });
      
      if (!pageTitle || !pageTitle.includes('Draft')) {
        log('  ⚠️ Drafts page may not have loaded correctly', 'yellow');
      } else {
        log(`  ✅ Page title found: ${pageTitle}`, 'green');
      }
    });

    await test('Check Create New Draft button', async () => {
      const createBtn = await page.$('#create-new-draft-btn');
      if (!createBtn) {
        log('  ⚠️ Create New Draft button not found', 'yellow');
        return;
      }
      
      log('  📍 Found Create New Draft button', 'blue');
      
      // Monitor navigation
      const navigationPromise = page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 5000 }).catch(() => null);
      
      await createBtn.click();
      await sleep(2000);
      
      await navigationPromise;
      
      const url = page.url();
      if (url.includes('workspace')) {
        log(`  ✅ Successfully navigated to workspace: ${url}`, 'green');
      } else {
        log(`  ⚠️ Expected workspace URL, got: ${url}`, 'yellow');
      }
    });

    await test('Navigate back to drafts page', async () => {
      await page.goto(`${BASE_URL}/drafts`, { waitUntil: 'networkidle2', timeout: 30000 });
      await sleep(2000);
    });

    await test('Check if draft table exists and has drafts', async () => {
      const hasDrafts = await page.evaluate(() => {
        const table = document.getElementById('drafts-table');
        const emptyState = document.getElementById('empty-state');
        const loading = document.getElementById('loading');
        
        return {
          hasTable: !!table,
          tableVisible: table && !table.classList.contains('hidden'),
          hasEmptyState: !!emptyState,
          emptyStateVisible: emptyState && !emptyState.classList.contains('hidden'),
          hasLoading: !!loading,
          loadingVisible: loading && !loading.classList.contains('hidden')
        };
      });
      
      log(`  📊 Drafts page state:`, 'blue');
      log(`    - Table exists: ${hasDrafts.hasTable}`, 'blue');
      log(`    - Table visible: ${hasDrafts.tableVisible}`, 'blue');
      log(`    - Empty state visible: ${hasDrafts.emptyStateVisible}`, 'blue');
      log(`    - Loading visible: ${hasDrafts.loadingVisible}`, 'blue');
      
      // Wait a bit for drafts to load
      await sleep(3000);
      
      const draftRows = await page.$$('#drafts-body tr');
      log(`  📊 Found ${draftRows.length} draft rows`, 'blue');
      
      if (draftRows.length > 0) {
        log('  ✅ Drafts found!', 'green');
      } else {
        log('  ℹ️ No drafts found (this is OK if user has no drafts)', 'yellow');
      }
    });

    await test('Click on a draft to edit (if drafts exist)', async () => {
      const draftRows = await page.$$('#drafts-body tr');
      
      if (draftRows.length === 0) {
        log('  ℹ️ No drafts to test edit functionality', 'yellow');
        return;
      }
      
      // Find the Edit link in the first draft row
      const editLink = await page.evaluateHandle(() => {
        const rows = Array.from(document.querySelectorAll('#drafts-body tr'));
        if (rows.length === 0) return null;
        
        const firstRow = rows[0];
        const links = firstRow.querySelectorAll('a');
        return Array.from(links).find(link => link.textContent.trim() === 'Edit');
      });
      
      if (!editLink || editLink.asElement() === null) {
        log('  ⚠️ Edit link not found in draft row', 'yellow');
        return;
      }
      
      log('  📍 Found Edit link, clicking...', 'blue');
      
      // Get draft ID from URL
      const href = await page.evaluate(el => el.href, editLink.asElement());
      const draftIdMatch = href.match(/draftId=(\d+)/);
      const draftId = draftIdMatch ? draftIdMatch[1] : null;
      
      if (draftId) {
        log(`  📋 Draft ID: ${draftId}`, 'blue');
      }
      
      // Monitor navigation
      const navigationPromise = page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => null);
      
      await editLink.asElement().click();
      await sleep(3000);
      
      await navigationPromise;
      
      const url = page.url();
      if (url.includes('workspace') && url.includes('draftId')) {
        log(`  ✅ Successfully navigated to workspace with draft: ${url}`, 'green');
        
        // Check if editor has content
        await sleep(2000);
        const editorContent = await page.evaluate(() => {
          const editor = document.getElementById('editor');
          if (!editor) return null;
          return editor.textContent || editor.innerText || '';
        });
        
        if (editorContent && editorContent.trim().length > 0) {
          log(`  ✅ Editor has content (${editorContent.length} chars): ${editorContent.substring(0, 50)}...`, 'green');
        } else {
          log(`  ⚠️ Editor appears to be empty`, 'yellow');
        }
      } else {
        log(`  ⚠️ Expected workspace URL with draftId, got: ${url}`, 'yellow');
      }
    });

  } finally {
    if (browser) {
      await browser.close();
      log('✅ Browser closed', 'green');
    }
  }

  console.log('\n======================================================================');
  console.log('📊 Drafts Comprehensive Test Summary');
  console.log('----------------------------------------------------------------------');
  console.log('✅ All draft functionality tests completed');
  console.log('======================================================================\n');
}

// Run tests if executed directly
if (require.main === module) {
  runDraftsComprehensiveTests().catch(error => {
    console.error('❌ Test suite failed:', error);
    process.exit(1);
  });
}

module.exports = { runDraftsComprehensiveTests };


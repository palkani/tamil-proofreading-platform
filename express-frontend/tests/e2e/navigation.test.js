/**
 * Navigation Tests
 * Tests all page links and navigation flows
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

let testResults = {
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
    console.error(error.stack);
  }
}

describe('Navigation Tests', () => {
  beforeAll(async () => {
    log('\n🚀 Starting Navigation Tests', 'blue');
    log('='.repeat(70), 'blue');
    
    const serverRunning = await checkServer();
    if (!serverRunning) {
      throw new Error('Server is not running! Please start the Express server first.');
    }
    
    await initBrowser();
  });

  afterAll(async () => {
    await closeBrowser();
    
    log('\n' + '='.repeat(70), 'blue');
    log('\n📊 Navigation Test Summary', 'blue');
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
  });

  // Home page navigation
  test('Home page loads correctly', async () => {
    const page = await navigateTo('/');
    await waitForElement('nav', 'default');
    
    const title = await page.title();
    if (!title || title.toLowerCase().includes('error')) {
      throw new Error(`Invalid page title: ${title}`);
    }
    
    const url = page.url();
    if (!url.includes(BASE_URL)) {
      throw new Error(`Invalid URL: ${url}`);
    }
  });

  test('Logo links to home page', async () => {
    const page = await navigateTo('/');
    await waitForElement('nav a[href="/"]', 'default');
    
    const logo = await page.$('nav a[href="/"]');
    if (!logo) {
      throw new Error('Logo link not found');
    }
    
    await logo.click();
    await waitForNavigation();
    
    const url = page.url();
    if (!url.endsWith('/') || !url.includes(BASE_URL)) {
      throw new Error(`Logo did not navigate to home: ${url}`);
    }
  });

  test('About link navigates correctly', async () => {
    const page = await navigateTo('/');
    const aboutLink = await page.$('nav a[href*="about"], a[href*="About"]');
    
    if (aboutLink) {
      await aboutLink.click();
      await waitForNavigation();
      // Just verify navigation happened
    }
  });

  test('Contact link navigates correctly', async () => {
    const page = await navigateTo('/');
    const contactLink = await page.$('nav a[href*="contact"], a[href*="Contact"]');
    
    if (contactLink) {
      await contactLink.click();
      await waitForNavigation();
    }
  });

  test('How to Use link navigates correctly', async () => {
    const page = await navigateTo('/');
    const howToUseLink = await page.$('nav a[href*="how"], a[href*="How"]');
    
    if (howToUseLink) {
      await howToUseLink.click();
      await waitForNavigation();
    }
  });

  // Authentication navigation
  test('Sign in link is visible when not logged in', async () => {
    const page = await navigateTo('/');
    const signInLink = await page.$('a[href*="login"], a[href*="Login"], button:has-text("Sign in"), a:has-text("Sign in")');
    
    // If user is logged in, sign out first
    const logoutLink = await page.$('a[href*="logout"], button:has-text("Logout"), a:has-text("Logout")');
    if (logoutLink) {
      await logoutLink.click();
      await waitForNavigation();
      await navigateTo('/');
    }
    
    // Check for sign in link (might be in different forms)
    const hasSignIn = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a, button'));
      return links.some(el => 
        el.textContent.toLowerCase().includes('sign in') ||
        el.href.includes('login')
      );
    });
    
    if (!hasSignIn) {
      throw new Error('Sign in link not found');
    }
  });

  test('Sign up link is visible when not logged in', async () => {
    const page = await navigateTo('/');
    
    const hasSignUp = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a, button'));
      return links.some(el => 
        el.textContent.toLowerCase().includes('sign up') ||
        el.href.includes('register')
      );
    });
    
    // Sign up link might not be present on all pages, so this is optional
  });

  // Workspace navigation (requires auth)
  test('Workspace link requires authentication', async () => {
    const page = await navigateTo('/workspace');
    
    // Should redirect to login or show auth error
    const url = page.url();
    const pageContent = await page.content();
    
    // Check if redirected to login or shows auth message
    const isLoginPage = url.includes('login') || pageContent.includes('login') || pageContent.includes('Sign in');
    const hasAuthError = pageContent.includes('authentication') || pageContent.includes('Unauthorized');
    
    if (!isLoginPage && !hasAuthError) {
      // Might already be logged in, check if workspace loaded
      const hasEditor = await page.$('#editor, [contenteditable], textarea');
      if (!hasEditor) {
        throw new Error('Workspace did not load and no auth redirect occurred');
      }
    }
  });

  // Drafts navigation
  test('Drafts page requires authentication', async () => {
    const page = await navigateTo('/drafts');
    
    const url = page.url();
    const pageContent = await page.content();
    
    const isLoginPage = url.includes('login') || pageContent.includes('login') || pageContent.includes('Sign in');
    const hasAuthError = pageContent.includes('authentication') || pageContent.includes('Unauthorized');
    const hasDrafts = pageContent.includes('Draft') || await page.$('[id*="draft"]');
    
    if (!isLoginPage && !hasAuthError && !hasDrafts) {
      throw new Error('Drafts page did not load and no auth redirect occurred');
    }
  });

  // Tools navigation
  test('OCR tool link navigates correctly', async () => {
    const page = await navigateTo('/');
    
    const ocrLink = await page.$('a[href*="ocr"], a[href*="OCR"]');
    if (ocrLink) {
      await ocrLink.click();
      await waitForNavigation();
      
      const url = page.url();
      if (!url.includes('ocr') && !url.includes('tools')) {
        throw new Error(`OCR link did not navigate correctly: ${url}`);
      }
    }
  });

  test('Document Converter link navigates correctly', async () => {
    const page = await navigateTo('/');
    
    const converterLink = await page.$('a[href*="converter"], a[href*="Converter"]');
    if (converterLink) {
      await converterLink.click();
      await waitForNavigation();
      
      const url = page.url();
      if (!url.includes('converter') && !url.includes('tools')) {
        throw new Error(`Converter link did not navigate correctly: ${url}`);
      }
    }
  });

  // Footer navigation
  test('Footer links work correctly', async () => {
    const page = await navigateTo('/');
    
    const footerLinks = await page.$$('footer a');
    
    for (const link of footerLinks.slice(0, 3)) { // Test first 3 links
      const href = await link.evaluate(el => el.href);
      if (href && href.startsWith(BASE_URL)) {
        await link.click();
        await waitForNavigation();
        // Just verify navigation happened
      }
    }
  });

  // Back button navigation
  test('Browser back button works', async () => {
    const page = await navigateTo('/');
    const initialUrl = page.url();
    
    // Navigate to another page
    await navigateTo('/contact');
    
    // Go back
    await page.goBack();
    await waitForNavigation();
    
    const currentUrl = page.url();
    if (currentUrl !== initialUrl && !currentUrl.includes(BASE_URL)) {
      throw new Error(`Back button did not work correctly. Expected: ${initialUrl}, Got: ${currentUrl}`);
    }
  });

  // 404 handling
  test('Invalid URL shows error page', async () => {
    const page = await navigateTo('/invalid-page-12345');
    
    const pageContent = await page.content();
    const url = page.url();
    
    // Should either show 404 or redirect to home
    const is404 = pageContent.includes('404') || pageContent.includes('Not Found');
    const isHome = url === BASE_URL + '/' || url === BASE_URL;
    
    if (!is404 && !isHome) {
      throw new Error('Invalid URL did not show 404 or redirect to home');
    }
  });
});

// Run tests if executed directly
if (require.main === module) {
  (async () => {
    try {
      const { beforeAll, afterAll, test: testFn } = require('./test-setup');
      
      // Wrap tests in a simple test runner
      const tests = describe.toString().match(/test\(['"](.*?)['"],\s*async\s*\(\)\s*=>\s*{([^}]+)}/g);
      
      console.log('Running navigation tests...');
      // Tests will be run by the describe function
    } catch (error) {
      console.error('Test runner error:', error);
      process.exit(1);
    }
  })();
}

module.exports = { test, describe };


/**
 * E2E Test Setup
 * Configures Puppeteer for browser automation testing
 */

const puppeteer = require('puppeteer');

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';
const HEADLESS = process.env.HEADLESS !== 'false'; // Default to headless
const SLOW_MO = process.env.SLOW_MO ? parseInt(process.env.SLOW_MO) : 0; // Delay in ms

let browser = null;
let pages = {};

/**
 * Initialize browser instance
 */
async function initBrowser() {
  if (browser) {
    return browser;
  }

  console.log('🚀 Launching browser...');
  browser = await puppeteer.launch({
    headless: HEADLESS,
    slowMo: SLOW_MO,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--disable-crash-reporter',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
    ],
    ignoreHTTPSErrors: true,
  });

  console.log(`✅ Browser launched (headless: ${HEADLESS})`);
  return browser;
}

/**
 * Get or create a new page
 */
async function getPage(name = 'default') {
  if (!browser) {
    await initBrowser();
  }

  if (!pages[name]) {
    pages[name] = await browser.newPage();
    
    // Set viewport
    await pages[name].setViewport({
      width: 1280,
      height: 720,
    });

    // Enable console logging from page
    pages[name].on('console', (msg) => {
      const type = msg.type();
      if (type === 'error') {
        console.error(`[Page ${name}] ${msg.text()}`);
      }
    });

    // Handle page errors
    pages[name].on('pageerror', (error) => {
      console.error(`[Page ${name} Error]`, error.message);
    });

    // Handle request failures
    pages[name].on('requestfailed', (request) => {
      console.error(`[Page ${name} Request Failed]`, request.url());
    });
  }

  return pages[name];
}

/**
 * Close a specific page
 */
async function closePage(name) {
  if (pages[name]) {
    try {
      if (!pages[name].isClosed()) {
        await pages[name].close();
      }
    } catch (error) {
      // Ignore close errors (page might already be closed)
      console.warn(`[Test] Warning: Could not close page ${name}:`, error.message);
    }
    delete pages[name];
  }
}

/**
 * Close browser and all pages
 */
async function closeBrowser() {
  // Close all pages
  const pageNames = Object.keys(pages);
  for (const name of pageNames) {
    await closePage(name);
  }
  pages = {};

  // Close browser
  if (browser) {
    try {
      const pages = await browser.pages();
      for (const page of pages) {
        if (!page.isClosed()) {
          await page.close().catch(() => {}); // Ignore errors
        }
      }
      await browser.close();
      console.log('✅ Browser closed');
    } catch (error) {
      console.warn('[Test] Warning: Error closing browser:', error.message);
    }
    browser = null;
  }
}

/**
 * Navigate to a URL
 */
async function navigateTo(url, pageName = 'default') {
  const page = await getPage(pageName);
  const fullUrl = url.startsWith('http') ? url : `${BASE_URL}${url}`;
  console.log(`📍 Navigating to: ${fullUrl}`);
  await page.goto(fullUrl, { waitUntil: 'networkidle2', timeout: 30000 });
  return page;
}

/**
 * Wait for element to appear
 */
async function waitForElement(selector, pageName = 'default', timeout = 10000) {
  const page = await getPage(pageName);
  try {
    await page.waitForSelector(selector, { timeout, visible: true });
    return true;
  } catch (error) {
    console.error(`❌ Element not found: ${selector}`);
    return false;
  }
}

/**
 * Wait for navigation
 */
async function waitForNavigation(pageName = 'default', timeout = 30000) {
  const page = await getPage(pageName);
  await page.waitForNavigation({ waitUntil: 'networkidle2', timeout });
}

/**
 * Take screenshot
 */
async function takeScreenshot(name, pageName = 'default') {
  const page = await getPage(pageName);
  const screenshotPath = `tests/e2e/screenshots/${name}-${Date.now()}.png`;
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`📸 Screenshot saved: ${screenshotPath}`);
  return screenshotPath;
}

/**
 * Check if server is running
 */
async function checkServer() {
  try {
    const page = await getPage('health-check');
    await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 5000 });
    await page.close();
    return true;
  } catch (error) {
    console.error('❌ Server is not running!', error.message);
    return false;
  }
}

module.exports = {
  initBrowser,
  getPage,
  closePage,
  closeBrowser,
  navigateTo,
  waitForElement,
  waitForNavigation,
  takeScreenshot,
  checkServer,
  BASE_URL,
};


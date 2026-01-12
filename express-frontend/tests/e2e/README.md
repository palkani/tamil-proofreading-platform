# E2E Test Suite

Comprehensive end-to-end tests for ProofTamil platform covering all pages, navigation, editors, and drafts functionality.

## Prerequisites

1. **Node.js** (v16 or higher)
2. **Express server running** on `http://localhost:3000`
3. **Puppeteer installed** (automatically installed with npm install)

## Setup

```bash
cd express-frontend
npm install
```

## Running Tests

### Run All Tests

```bash
npm run test:e2e
```

### Run Specific Test Suites

```bash
# Comprehensive tests (all pages and navigation)
npm run test:e2e:comprehensive

# Drafts page tests
npm run test:e2e:drafts

# Editor tests (home and workspace)
npm run test:e2e:editor
```

### Run in Headed Mode (See Browser)

```bash
npm run test:e2e:headed
```

### Run in Debug Mode (Slow Motion)

```bash
npm run test:e2e:debug
```

## Test Coverage

### Comprehensive Tests (`comprehensive.test.js`)
- Home page loading and content
- Navigation bar functionality
- Logo and link navigation
- Contact and How to Use pages
- Workspace page access (auth required)
- Drafts page access (auth required)
- OCR and Document Converter tool pages
- Responsive design (mobile viewport)
- Browser back button
- 404 error handling

### Drafts Tests (`drafts.test.js`)
- Drafts page loading (or auth redirect)
- "Create New Draft" button visibility
- Creating new draft navigates to workspace
- Drafts list display
- Clicking draft opens in workspace
- Draft title input presence

### Editor Tests (`editor.test.js`)
- Home page editor accessibility
- Home page editor accepts English text
- Home page editor accepts Tamil text
- Home page editor accepts paste
- Workspace editor accessibility (if logged in)
- Workspace editor accepts Tamil text (if logged in)
- Word count display
- Editor toolbar functionality
- Auto-save functionality

## Test Structure

```
tests/e2e/
├── test-setup.js          # Browser setup and utilities
├── comprehensive.test.js  # All pages and navigation
├── drafts.test.js         # Drafts functionality
├── editor.test.js         # Editor functionality
├── run-all-tests.js       # Run all test suites
└── screenshots/           # Screenshots (generated during tests)
```

## Configuration

Set environment variables to customize test behavior:

```bash
# Base URL (default: http://localhost:3000)
TEST_BASE_URL=http://localhost:3000 npm run test:e2e

# Run in headed mode
HEADLESS=false npm run test:e2e

# Slow motion (delay in ms)
SLOW_MO=100 npm run test:e2e

# Debug mode (headed + slow motion)
DEBUG=true HEADLESS=false SLOW_MO=100 npm run test:e2e
```

## Troubleshooting

### Server Not Running

If tests fail with "Server is not running", start the Express server:

```bash
cd express-frontend
npm start
```

### Browser Launch Fails

If Puppeteer fails to launch Chrome:

1. **macOS**: Chrome should be installed automatically
2. **Linux**: Install Chrome or Chromium
3. **Windows**: Chrome should be installed automatically

If issues persist, try:

```bash
# Reinstall Puppeteer
npm uninstall puppeteer
npm install puppeteer --save-dev
```

### Tests Timeout

If tests timeout, increase timeout values in test files or check:
- Server is running and responsive
- Network connectivity
- Firewall settings

### Screenshots

Screenshots are automatically saved to `tests/e2e/screenshots/` on errors (if implemented).

## Test Results

Tests output colored results:
- ✅ Green: Passed tests
- ❌ Red: Failed tests
- ⚠️ Yellow: Skipped tests (e.g., requires authentication)

## Notes

- Some tests require authentication and will be skipped if not logged in
- Tests are designed to work with or without authentication
- Tests gracefully handle missing elements (logged as warnings)
- Tests use realistic delays to simulate user interaction

## CI/CD Integration

Tests can be integrated into CI/CD pipelines:

```yaml
# Example GitHub Actions
- name: Run E2E Tests
  run: |
    cd express-frontend
    npm install
    npm start &
    sleep 10
    npm run test:e2e
```

## Contributing

When adding new tests:
1. Follow existing test structure
2. Use helper functions from `test-setup.js`
3. Add appropriate error handling
4. Document test purpose in comments
5. Update this README if adding new test suites


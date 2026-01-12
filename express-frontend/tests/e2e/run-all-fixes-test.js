/**
 * Run All Fixes Test Suite
 * Tests all the fixes for the 4 reported issues:
 * 1. My Drafts link navigation
 * 2. Paste text triggering API calls
 * 3. View draft 404 error
 * 4. Edit draft showing empty editor
 */

const { runDraftsComprehensiveTests } = require('./drafts-comprehensive.test');
const { runPasteTests } = require('./paste.test');

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

async function runAllFixesTests() {
  console.log('\n🚀 Running All Fixes Test Suite');
  console.log('='.repeat(70));
  console.log('Testing fixes for:');
  console.log('  1. My Drafts link navigation');
  console.log('  2. Paste text triggering API calls');
  console.log('  3. View draft 404 error (fixed by changing link)');
  console.log('  4. Edit draft showing empty editor');
  console.log('='.repeat(70));
  
  const results = {
    passed: 0,
    failed: 0,
    errors: []
  };
  
  // Test 1 & 3 & 4: Drafts comprehensive tests
  try {
    log('\n📋 Running Drafts Comprehensive Tests (Issues 1, 3, 4)...', 'cyan');
    await runDraftsComprehensiveTests();
    results.passed++;
    log('✅ Drafts tests passed', 'green');
  } catch (error) {
    results.failed++;
    results.errors.push({ test: 'Drafts Comprehensive', error: error.message });
    log(`❌ Drafts tests failed: ${error.message}`, 'red');
  }
  
  // Test 2: Paste functionality
  try {
    log('\n📋 Running Paste Tests (Issue 2)...', 'cyan');
    await runPasteTests();
    results.passed++;
    log('✅ Paste tests passed', 'green');
  } catch (error) {
    results.failed++;
    results.errors.push({ test: 'Paste', error: error.message });
    log(`❌ Paste tests failed: ${error.message}`, 'red');
  }
  
  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('📊 Test Summary');
  console.log('='.repeat(70));
  log(`✅ Passed: ${results.passed}`, 'green');
  log(`❌ Failed: ${results.failed}`, results.failed > 0 ? 'red' : 'green');
  
  if (results.errors.length > 0) {
    console.log('\nErrors:');
    results.errors.forEach((err, i) => {
      log(`  ${i + 1}. ${err.test}: ${err.error}`, 'red');
    });
  }
  
  console.log('='.repeat(70));
  
  if (results.failed > 0) {
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  runAllFixesTests().catch(error => {
    console.error('❌ Test suite failed:', error);
    process.exit(1);
  });
}

module.exports = { runAllFixesTests };


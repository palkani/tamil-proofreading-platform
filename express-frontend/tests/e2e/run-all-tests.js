/**
 * Run All E2E Tests
 * Executes all test suites in sequence
 */

const { runTests } = require('./comprehensive.test');
const { runDraftsTests } = require('./drafts.test');
const { runEditorTests } = require('./editor.test');

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

async function runAllTests() {
  log('\n🚀 Running All E2E Tests', 'blue');
  log('='.repeat(70), 'blue');

  const allResults = {
    passed: 0,
    failed: 0,
    errors: [],
  };

  // Run comprehensive tests
  try {
    log('\n📋 Running Comprehensive Tests...', 'cyan');
    await runTests();
  } catch (error) {
    log(`\n❌ Comprehensive tests failed: ${error.message}`, 'red');
    allResults.failed++;
    allResults.errors.push({ suite: 'Comprehensive', error: error.message });
  }

  // Run drafts tests
  try {
    log('\n📄 Running Drafts Tests...', 'cyan');
    const draftsResults = await runDraftsTests();
    allResults.passed += draftsResults.passed;
    allResults.failed += draftsResults.failed;
    allResults.errors.push(...draftsResults.errors.map(e => ({ suite: 'Drafts', ...e })));
  } catch (error) {
    log(`\n❌ Drafts tests failed: ${error.message}`, 'red');
    allResults.failed++;
    allResults.errors.push({ suite: 'Drafts', error: error.message });
  }

  // Run editor tests
  try {
    log('\n✏️  Running Editor Tests...', 'cyan');
    const editorResults = await runEditorTests();
    allResults.passed += editorResults.passed;
    allResults.failed += editorResults.failed;
    allResults.errors.push(...editorResults.errors.map(e => ({ suite: 'Editor', ...e })));
  } catch (error) {
    log(`\n❌ Editor tests failed: ${error.message}`, 'red');
    allResults.failed++;
    allResults.errors.push({ suite: 'Editor', error: error.message });
  }

  // Final summary
  log('\n' + '='.repeat(70), 'blue');
  log('\n📊 Final Test Summary', 'blue');
  log('-'.repeat(70), 'blue');
  log(`Total Tests: ${allResults.passed + allResults.failed}`, 'blue');
  log(`Passed: ${allResults.passed}`, 'green');
  log(`Failed: ${allResults.failed}`, allResults.failed > 0 ? 'red' : 'green');

  if (allResults.errors.length > 0) {
    log('\n❌ Errors:', 'red');
    allResults.errors.forEach(err => {
      const suite = err.suite || 'Unknown';
      const test = err.test || 'Suite';
      const error = err.error || err;
      log(`  - [${suite}] ${test}: ${error}`, 'red');
    });
  }

  log('\n' + '='.repeat(70), 'blue');

  if (allResults.failed === 0) {
    log('\n✅ All tests passed!', 'green');
    process.exit(0);
  } else {
    log('\n❌ Some tests failed.', 'red');
    process.exit(1);
  }
}

if (require.main === module) {
  runAllTests().catch(error => {
    log(`\n💥 Fatal error: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
  });
}

module.exports = { runAllTests };


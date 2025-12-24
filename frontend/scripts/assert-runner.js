const fs = require('fs');
const path = require('path');

const runnerPath = path.join(__dirname, '..', 'lib', 'transliterator-runner.ts');

if (!fs.existsSync(runnerPath)) {
  console.error('[Build] Missing transliterator-runner.ts at frontend/lib/transliterator-runner.ts');
  process.exit(1);
}

console.log('[Build] Found transliterator-runner.ts');


const fs = require('fs');
const path = require('path');

const runnerPath = path.join(__dirname, '..', 'public', 'js', 'transliterator-runner.js');

if (!fs.existsSync(runnerPath)) {
  console.error('[Build] Missing transliterator-runner.js at public/js/transliterator-runner.js');
  process.exit(1);
}

console.log('[Build] Found transliterator-runner.js');


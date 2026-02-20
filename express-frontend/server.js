/**
 * Local development / Docker entry point.
 * Responsibility: load .env and call app.listen() — nothing else.
 * All Express configuration lives in create-app.js.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { createApp, ensureAppReady } = require('./create-app');

const app = createApp();
const appReady = ensureAppReady();

const PORT = process.env.PORT || 3000;

appReady
  .then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Express server running on http://0.0.0.0:${PORT}`);
    });
  })
  .catch((error) => {
    console.error('[SERVER] Express app failed to initialize:', error.message);
    process.exit(1);
  });

module.exports = app;

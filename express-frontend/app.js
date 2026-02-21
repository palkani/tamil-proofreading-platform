/**
 * Vercel Serverless entry point.
 * Responsibility: export an async handler for Vercel — nothing else.
 * All Express configuration lives in create-app.js.
 */
require('express'); // So Vercel build detects Express entrypoint
const { createApp, ensureAppReady } = require('./create-app');

const app = createApp();
const appReady = ensureAppReady();

module.exports = async (req, res) => {
  try {
    await appReady;
  } catch (err) {
    console.error('[Init] appReady failed (non-fatal):', err?.message);
  }
  return app(req, res);
};

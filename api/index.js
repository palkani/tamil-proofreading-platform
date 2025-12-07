const { app, appReady } = require('../express-frontend/app');

module.exports = async (req, res) => {
  try {
    await appReady;
    return app(req, res);
  } catch (error) {
    console.error('[Vercel] Failed to initialize Express app', error);
    res.statusCode = 500;
    res.end('Express application failed to initialize');
  }
};

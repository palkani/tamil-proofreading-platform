const { app, appReady, PORT } = require('./app');

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

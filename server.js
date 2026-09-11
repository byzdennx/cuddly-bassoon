'use strict';

const app = require('./src/app');
const config = require('./src/config');
const logger = require('./src/core/logger');

const server = app.listen(config.port, () => {
  logger.banner();
  logger.success(`Server listening on http://localhost:${config.port}`);
  logger.info(`Environment      : ${config.env}`);
  logger.info(`Docs             : http://localhost:${config.port}/docs`);
  logger.info(`Playground       : http://localhost:${config.port}/playground`);
  logger.info(`API root         : http://localhost:${config.port}${config.apiPrefix}`);
});

function shutdown(signal) {
  logger.warn(`${signal} received, closing server...`);
  server.close(() => {
    logger.info('Server closed cleanly.');
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 8000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (err) => logger.error(`Unhandled rejection: ${err?.message || err}`));
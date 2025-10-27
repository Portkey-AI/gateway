let _logger: any;

if (process && process.env.logger === 'loki') {
  const { LokiLogger } = await import('./loki/logger.js');
  _logger = LokiLogger;
} else {
  _logger = console;
}

export const logger = _logger;

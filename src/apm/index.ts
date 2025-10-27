import { Environment } from '../utils/env.js';

let _logger: any;

if (Environment().APM_LOGGER === 'loki') {
  const { LokiLogger } = await import('./loki/logger.js');
  _logger = LokiLogger;
} else {
  _logger = console;
}

export const logger = _logger;

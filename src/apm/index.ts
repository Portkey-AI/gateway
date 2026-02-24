import type winston from 'winston';
import { getRuntimeKey } from 'hono/adapter';
import { getLokiLogger } from './loki/logger';

let logger: winston.Logger | WrappedConsole;

function serializeError(err: unknown) {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      stack: err.stack,
      cause: err.cause,
    };
  }
  return err;
}

function normalizeArg(arg: any) {
  if (arg instanceof Error) {
    return serializeError(arg);
  }

  // Handle nested error objects only one level deep
  if (arg.error && arg.error instanceof Error) {
    return {
      ...arg,
      error: serializeError(arg.error),
    };
  }

  return arg;
}

export class WrappedConsole {
  constructor(private readonly console: Console) {}

  error(...args: any[]) {
    const firstString = args.find((a) => typeof a === 'string');
    const firstError = args.find((a) => a instanceof Error);

    if (firstString && firstError) {
      this.console.error({
        level: 'error',
        message: firstString,
        error: serializeError(firstError),
        extra: args.filter((a) => a !== firstString && a !== firstError),
      });
      return;
    }

    this.console.error(...args.map(normalizeArg));
  }

  warn(...args: any[]) {
    this.console.warn(...args);
  }

  info(...args: any[]) {
    this.console.info(...args);
  }

  log(...args: any[]) {
    this.console.log(...args);
  }

  debug(...args: any[]) {
    this.console.debug(...args);
  }
}

if (getRuntimeKey() === 'workerd') {
  logger = new WrappedConsole(console);
} else {
  // Dynamic import - only loads in Node.js runtime
  logger = getLokiLogger();
}

export { logger };

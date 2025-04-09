import { Context } from 'hono';
import { createProtectionManager } from './createProtectionManager';

export const protectionManager = createProtectionManager({
  desiredProtectionDurationInMins: 15,
  maintainProtectionPercentage: 10,
  refreshProtectionPercentage: 80,
  protectionAdjustIntervalInMs: 10 * 1000,
});

process.on('SIGTERM', () => {
  protectionManager.close();
});
process.on('SIGINT', () => {
  protectionManager.close();
});

export const protection = () => {
  return async (c: Context, next: any) => {
    await protectionManager.acquireProtection();

    await next();
    // Only immediately release if not a stream
    if (!(c.res instanceof ReadableStream)) {
      // If it's not a streaming response, there's nothing extra to wrap,
      // so you can do final logic right now
      await protectionManager.releaseProtection();
    }
  };
};

import { Context } from 'hono';
import { createProtectionManager } from './createProtectionManager';

export const protectionManager = createProtectionManager({
  desiredProtectionDurationInMins: 15,
  maintainProtectionPercentage: 1,
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
    if (!(c.res.body instanceof ReadableStream)) {
      // If it's not a streaming response, there's nothing extra to wrap,
      // so you can do final logic right now

      // We don't actually care to wait for the release to finish
      // and in fact often it might take a while to release
      protectionManager.releaseProtection().catch((err) => {
        console.error('Error releasing protection:', err);
      });
    }
  };
};

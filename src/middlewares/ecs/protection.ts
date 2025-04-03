import { Context } from 'hono';
import { createProtectionManager } from './createProtectionManager';

const protectionManager = createProtectionManager({
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
    // 2) If the response is streaming, wrap the original ReadableStream so we know
    //    exactly when the last chunk is done. Then we can do cleanup.
    const originalResponse = c.res;
    const originalBody = originalResponse.body;

    // Only wrap if it's a ReadableStream
    if (originalBody instanceof ReadableStream) {
      const releaseProtection = async () => {
        try {
          await protectionManager.releaseProtection();
        } catch (err) {
          console.error('[Middleware] Error releasing protection:', err);
        }
      };

      // Create a TransformStream to monitor completion/error
      const monitorStream = new TransformStream({
        transform(chunk, controller) {
          // Pass data through untouched
          try {
            controller.enqueue(chunk);
          } catch (err) {
            console.error('[Middleware] Error during transform enqueue:', err);
            // If enqueue fails, signal error and release
            releaseProtection();
            controller.error(err); // Propagate error
          }
        },
        flush() {
          console.log('[Middleware] Source stream finished successfully.');
          releaseProtection();
        },
      });

      // Pipe the original body through the monitor
      const monitoredBody = originalBody.pipeThrough(monitorStream);

      // Re-create the Response with the new body stream
      // Hono uses a setter internally for res, so we need to set to undefined
      // first to completely unset the Response, before then trying to set it
      // to our wrapped version
      // Docs here: https://hono.dev/docs/guides/middleware#modify-the-response-after-next
      c.res = undefined;
      c.res = new Response(monitoredBody, {
        status: originalResponse.status,
        headers: originalResponse.headers,
      });
    } else {
      // If it's not a streaming response, there's nothing extra to wrap,
      // so you can do final logic right now
      await protectionManager.releaseProtection();
    }
  };
};

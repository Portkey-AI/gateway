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
      const reader = originalBody.getReader();

      // Create a new ReadableStream that proxies data but also runs cleanup when done
      const wrappedStream = new ReadableStream({
        async pull(controller) {
          const { done, value } = await reader.read();
          if (done) {
            // Cleanup work after the final chunk
            await protectionManager.releaseProtection();
            controller.close();
            return;
          }
          controller.enqueue(value);
        },
      });

      // Re-create the Response with the new body stream
      c.res = new Response(wrappedStream, {
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

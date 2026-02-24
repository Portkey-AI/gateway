import { Context } from 'hono';
import { METRICS_KEYS } from '../globals';

export const payloadSizeValidatorMiddleware = (
  maxJsonPayloadSizeInMB: number
) => {
  return async (c: Context, next: any) => {
    if (c.req.raw.headers.get('content-type') === 'application/json') {
      const contentLength = c.req?.raw?.headers?.get('content-length') || '0';
      const payloadSize = contentLength ? parseInt(contentLength) / 1048576 : 0;
      c.set(METRICS_KEYS.PAYLOAD_SIZE_IN_MB, payloadSize);
      if (maxJsonPayloadSizeInMB && payloadSize > maxJsonPayloadSizeInMB) {
        return c.json(
          {
            status: 'failure',
            message: `Payload size exceeds the limit of ${maxJsonPayloadSizeInMB}MB`,
          },
          413
        );
      }
    }
    return next();
  };
};

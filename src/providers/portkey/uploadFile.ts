import { Readable } from 'stream';
import { getRuntimeKey } from 'hono/adapter';

const runtime = getRuntimeKey();
export const PortkeyBatchRequestRowTransform = (row: Record<string, any>) => {
  return row;
};

export const PortkeyUploadFileRequestTransform = (
  requestBody: ReadableStream
) => {
  if (runtime === 'workerd') {
    return requestBody;
  }
  return Readable.fromWeb(requestBody as any);
};

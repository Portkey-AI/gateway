import { RequestHandler } from '../types';
import { getBatchDetails, getFileFromLogStore } from './utils';
import { logger } from '../../apm';
import PortkeyAPIConfig from './api';
import { env, getRuntimeKey } from 'hono/adapter';
import { PORTKEY_HEADER_KEYS } from '../../middlewares/portkey/globals';
import { Readable } from 'stream';
import app from '../..';

const runtime = getRuntimeKey();

export const PortkeyBatchGetOutputHandler: RequestHandler = async ({
  requestURL,
  providerOptions,
  c,
  requestHeaders,
}) => {
  const url = new URL(requestURL);
  const pathname = url.pathname;

  const batchId = pathname.split('/').at(-2);

  if (!batchId || !batchId.startsWith('pk_batch')) {
    return Response.json(
      {
        message: {
          error: 'Invalid batch ID',
          code: null,
        },
      },
      { status: 400 }
    );
  }

  const baseUrl = await PortkeyAPIConfig.getBaseURL({
    c,
    gatewayRequestURL: requestURL,
    providerOptions: providerOptions,
    fn: 'getBatchOutput',
  });

  const options = PortkeyAPIConfig?.getOptions?.();
  const headers = await PortkeyAPIConfig.headers({
    c,
    fn: 'getBatchOutput',
    providerOptions: providerOptions,
    transformedRequestBody: {},
    transformedRequestUrl: requestURL,
  });

  const batchDetailsURL = `${baseUrl}/batches/${batchId}/output`;
  const batchDetailsURLWithParams = `${batchDetailsURL}?details=true`;

  const batchDetails = await getBatchDetails(
    batchDetailsURLWithParams,
    options,
    headers
  );

  if (batchDetails.error) {
    logger.error(batchDetails.error);
    const error = batchDetails.error;
    return Response.json(
      error instanceof Error
        ? {
            message: {
              error: batchDetails.error.message,
              code: null,
              source: 'control_plane',
            },
          }
        : error,
      { status: 500 }
    );
  }

  const BatchOutputHeaders = batchDetails.data.portkey_options;

  const executionCtx =
    getRuntimeKey() === 'workerd' ? c.executionCtx : undefined;

  const batchType = batchDetails.data.completion_window;

  if (batchType === '24h') {
    const providerBatchId = batchDetails.data.external_batch_id;

    // URL for hono to parse the pathname and invoke handler
    const batchOutputURL = `https://api.portkey.ai/v1/batches/${providerBatchId}/output`;

    return app.request(
      batchOutputURL,
      {
        headers: {
          ...BatchOutputHeaders,
          [PORTKEY_HEADER_KEYS.IGNORE_SERVICE_LOG]: true,
          [PORTKEY_HEADER_KEYS.API_KEY]:
            requestHeaders[PORTKEY_HEADER_KEYS.API_KEY],
        },
      },
      env(c),
      executionCtx
    );
  }

  const batchOutputBucket = batchDetails.data.bucket;
  const batchOutputKey = batchDetails.data.key;

  try {
    const fetchResponse = await getFileFromLogStore(
      env(c),
      batchOutputBucket,
      batchOutputKey
    );

    if (fetchResponse.ok && fetchResponse.body) {
      const responseBody =
        runtime === 'node'
          ? Readable.toWeb(fetchResponse.body as Readable) // WebStream in worker env.
          : fetchResponse.body;
      return new Response(responseBody as any, {
        headers: {
          'Content-Type': 'application/octet-stream',
        },
      });
    }

    const error = await fetchResponse.text();
    return Response.json(
      {
        message: {
          error: error,
        },
      },
      { status: 500 }
    );
  } catch (e) {
    logger.error(e);
    return Response.json({
      message: {
        error: e,
      },
    });
  }
};

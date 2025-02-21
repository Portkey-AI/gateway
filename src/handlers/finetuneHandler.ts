import { Context } from 'hono';
import {
  constructConfigFromRequestHeaders,
  tryTargetsRecursively,
} from './handlerUtils';

const getEndpointString = (c: Context) => {
  const jobId = c.req.param('jobId');
  const method = c.req.method;
  const isCancel = method === 'POST' && !!jobId;

  // GET endpoint with jobID - Get finetune
  if (method === 'GET' && !!jobId) {
    return 'retrieveFinetune';
  }
  if (method === 'GET' && !jobId) {
    return 'listFinetunes';
  }
  // POST endpoint without jobID - Create finetune
  if (method === 'POST' && !jobId) {
    return 'createFinetune';
  }
  // POST endpoint with jobID - Cancel finetune
  if (isCancel) {
    return 'cancelFinetune';
  }
  return 'listFinetunes';
};

const BODY_SUPPORTED_ENDPOINTS = ['createFinetune'];

async function finetuneHandler(c: Context) {
  const endpoint = getEndpointString(c);
  try {
    const method = c.req.method;
    const requestHeaders = Object.fromEntries(c.req.raw.headers);
    const request = BODY_SUPPORTED_ENDPOINTS.includes(endpoint)
      ? await c.req.json()
      : {};
    const camelCaseConfig = constructConfigFromRequestHeaders(requestHeaders);
    const tryTargetsResponse = await tryTargetsRecursively(
      c,
      camelCaseConfig ?? {},
      request,
      requestHeaders,
      endpoint,
      method,
      'config'
    );

    return tryTargetsResponse;
  } catch (err: any) {
    console.error({ message: `${endpoint} error ${err.message}` });
    return new Response(
      JSON.stringify({
        status: 'failure',
        message: 'Something went wrong',
      }),
      {
        status: 500,
        headers: {
          'content-type': 'application/json',
        },
      }
    );
  }
}

export default finetuneHandler;

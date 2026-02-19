import { Context } from 'hono';
import { createDatasetValidator, putDatasetValidator } from './validation';
import { PORTKEY_HEADER_KEYS } from '../../middlewares/portkey/globals';
import { externalServiceFetch, internalServiceFetch } from '../../utils/fetch';
import { Environment } from '../../utils/env';

const isPrivateDeployment = Environment({}).PRIVATE_DEPLOYMENT === 'ON';

const getInvalidRequestResponse = () =>
  new Response(
    JSON.stringify({
      success: false,
      message: 'Invalid Request body',
    }),
    {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );

const ALBUS_BASEPATH = Environment({}).ALBUS_BASEPATH;

export const getHeaders = (headers: Record<string, string>) => {
  const apiKey = headers[PORTKEY_HEADER_KEYS.API_KEY];
  const fetchOptions: Record<string, any> = {};

  fetchOptions['headers'] = {
    Authorization: Environment({}).PORTKEY_CLIENT_AUTH,
    [PORTKEY_HEADER_KEYS.API_KEY]: apiKey,
    'content-type': 'application/json',
  };
  return fetchOptions;
};

export const createDatasetTransformer = async (context: Context) => {
  const headers = context.req.header();
  const fetchOptions = getHeaders(headers);
  const body = await context.req.json();
  const validateBodyResult = await createDatasetValidator.safeParseAsync(body);

  if (!validateBodyResult.success || !validateBodyResult.data) {
    return getInvalidRequestResponse();
  }

  const albusRoute = `${ALBUS_BASEPATH}/v1/datasets`;

  return await (
    isPrivateDeployment ? internalServiceFetch : externalServiceFetch
  )(albusRoute, {
    method: 'POST',
    body: JSON.stringify(validateBodyResult.data),
    ...fetchOptions,
  });
};

export const datasetIdHandler = async (context: Context) => {
  const route = context.req.path;

  const headers = context.req.header();
  const fetchOptions = getHeaders(headers);

  const method = context.req.method;

  const albusRoute = `${ALBUS_BASEPATH}${route}`;
  if (method === 'GET') {
    return await (
      isPrivateDeployment ? internalServiceFetch : externalServiceFetch
    )(albusRoute, fetchOptions);
  }

  const body = await context.req.json();
  const validateBodyResult = await putDatasetValidator.safeParseAsync(body);

  if (!validateBodyResult.success) {
    return getInvalidRequestResponse();
  }

  return await (
    isPrivateDeployment ? internalServiceFetch : externalServiceFetch
  )(albusRoute, {
    method: 'PUT',
    body: JSON.stringify(validateBodyResult.data),
    ...fetchOptions,
  });
};

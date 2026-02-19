import { Context } from 'hono';
import { PORTKEY_HEADER_KEYS } from '../../middlewares/portkey/globals';
import { createFinetuneJobValidation } from './validation';
import { externalServiceFetch, internalServiceFetch } from '../../utils/fetch';
import { Environment } from '../../utils/env';

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
const isPrivateDeployment = Environment({}).PRIVATE_DEPLOYMENT === 'ON';

const getHeaders = (headers: Record<string, string>) => {
  const apiKey = headers[PORTKEY_HEADER_KEYS.API_KEY];
  const fetchOptions: Record<string, any> = {};

  fetchOptions['headers'] = {
    Authorization: Environment({}).PORTKEY_CLIENT_AUTH,
    [PORTKEY_HEADER_KEYS.API_KEY]: apiKey,
    'content-type': 'application/json',
  };
  return fetchOptions;
};

export const transformPostFiles = async (context: Context) => {
  const method = context.req.method;

  if (method.toUpperCase() !== 'POST') {
    return new Response(
      JSON.stringify({ message: 'Method not Allowed', success: 'false' }),
      { status: 405 }
    );
  }
};

export const finetuneGetHandler = async (context: Context) => {
  const path = context.req.path;

  const jobId = path.split('/').at(-1);

  const albusRoute = `${ALBUS_BASEPATH}/v1/finetune/${jobId}`;
  const headers = context.req.header();

  const fetchOptions = getHeaders(headers);

  return await (
    isPrivateDeployment ? internalServiceFetch : externalServiceFetch
  )(albusRoute, { ...fetchOptions });
};

export const finetuneCancelHandler = async (context: Context) => {
  const path = context.req.path;

  const jobId = path.split('/').at(-1);

  const albusRoute = `${ALBUS_BASEPATH}/v1/finetune/${jobId}/cancel`;
  const headers = context.req.header();

  const fetchOptions = getHeaders(headers);

  return await (
    isPrivateDeployment ? internalServiceFetch : externalServiceFetch
  )(albusRoute, {
    ...fetchOptions,
    method: 'POST',
  });
};

export const startFinetuneJobHandler = async (context: Context) => {
  const headers = context.req.header();

  const albusRoute = `${ALBUS_BASEPATH}/v1/finetune`;
  const fetchOptions = getHeaders(headers);
  const body = await context.req.json();

  const validateBodyResult =
    await createFinetuneJobValidation.safeParseAsync(body);

  if (!validateBodyResult.success) {
    return getInvalidRequestResponse();
  }

  try {
    const finetuneResponse = await (
      isPrivateDeployment ? internalServiceFetch : externalServiceFetch
    )(albusRoute, {
      body: JSON.stringify(validateBodyResult.data),
      ...fetchOptions,
      method: 'POST',
    });

    if (!finetuneResponse.ok) {
      return finetuneResponse;
    }

    const finetuneResult = (await finetuneResponse.clone().json()) as any;
    const finetuneJobId = finetuneResult?.data?.id;
    if (!finetuneJobId) {
      console.info(
        `Not able to find finetune job id ${JSON.stringify(finetuneResult)}`
      );

      return new Response(
        JSON.stringify({
          message: 'Something went wrong, please try again later',
          success: false,
        }),
        { status: 500 }
      );
    }

    await (isPrivateDeployment ? internalServiceFetch : externalServiceFetch)(
      `${albusRoute}/${finetuneJobId}/validation/start`,
      {
        ...fetchOptions,
        method: 'POST',
        body: JSON.stringify({
          overrideParams: validateBodyResult.data.overrideParams,
        }),
      }
    );

    return finetuneResponse;
  } catch (err) {
    return new Response(
      JSON.stringify({
        message: (err as Error)?.message,
        success: false,
      }),
      { status: 500 }
    );
  }
};

import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginHandlerOptions,
  PluginParameters,
} from '../types';

const HEADERS_TO_INCLUDE = [
  'x-portkey-virtual-key',
  'x-portkey-provider',
  'x-portkey-metadata',
  'x-portkey-trace-id',
  'x-portkey-span-id',
  'x-portkey-parent-span-id',
  'x-portkey-span-name',
  'x-portkey-runtime',
  'x-portkey-runtime-version',
  'x-portkey-forward-headers',
  'Authorization',
  'x-portkey-provider-model',
  'x-portkey-provider-file-name',
  'x-portkey-fireworks-account-id',
  // Override supported headers, pass them to dataservice, if sent in the request.
  'x-portkey-vertex-region',
  'x-portkey-aws-region',
];

const PROVIDER_HEADER_PATTERNS = [
  'x-portkey-vertex',
  'x-portkey-aws',
  'x-portkey-azure',
  'x-portkey-aws',
  'x-portkey-openai',
  'x-portkey-anthropic',
];

export const handler: PluginHandler = async (
  context: PluginContext,
  parameters: PluginParameters,
  eventType: HookEventType,
  options: PluginHandlerOptions
) => {
  const defaultResponse = {
    verdict: true,
    data: null,
    error: null,
  };

  const ignoreServiceLog =
    context.request?.headers['x-portkey-ignore-service-log'] === 'true';

  if (
    !process.env.DATASERVICE_BASEPATH ||
    eventType === 'beforeRequestHook' ||
    ignoreServiceLog
  ) {
    return defaultResponse;
  }
  // Continue the hook only if it's batch or fine-tune and a pass through call not a portkey job.
  if (
    !['createBatch', 'createFinetune'].includes(context.requestType ?? '') ||
    context.provider === 'portkey'
  ) {
    return defaultResponse;
  }

  const response = context.response?.json;
  const recordId = response?.id;
  if (!recordId) {
    return defaultResponse;
  }

  const headersToInclude: Record<string, string> = {};
  // include headers that are required for authentication or provider specific headers
  Object.keys(context.request?.headers || {})
    .filter((header) => HEADERS_TO_INCLUDE.includes(header))
    .forEach((headerKey) => {
      headersToInclude[headerKey] = context.request?.headers[headerKey];
    });

  headersToInclude['x-portkey-config'] =
    context.request?.headers['x-portkey-config-slug'];

  // If no auth headers are present, include provider specific headers
  if (
    (!headersToInclude['x-portkey-virtual-key'] &&
      (!headersToInclude['x-portkey-provider'] ||
        !headersToInclude['x-portkey-provider']?.startsWith('@'))) ||
    headersToInclude['x-portkey-config']
  ) {
    Object.keys(context.request?.headers || {}).forEach((headerKey) => {
      if (
        PROVIDER_HEADER_PATTERNS.some((pattern) =>
          headerKey.startsWith(pattern)
        )
      ) {
        headersToInclude[headerKey] = context.request?.headers[headerKey];
      }
    });
  }

  const requestBody = context.request?.json;

  const traceId = headersToInclude['x-portkey-trace-id'];
  delete headersToInclude['x-portkey-trace-id'];

  const body = {
    ...requestBody,
    external_batch_id: recordId,
    portkey_options: {
      'x-portkey-trace-id': traceId,
      'x-portkey-span-id': recordId,
      'x-portkey-provider': context.provider,
      ...headersToInclude,
    },
    provider_options: {
      model: requestBody?.model,
    },
    input_file_id: undefined,
    external_input_file_id: requestBody?.input_file_id,
  };

  const endpoint =
    context.requestType === 'createBatch' ? 'batches' : 'fine_tuning/jobs';

  try {
    const organisationId = JSON.parse(
      context.request?.headers['x-auth-organisation-details']
    )?.id;
    const apiKey = context.request?.headers['x-portkey-api-key'];
    const dataserviceResponse = await options.internalServiceFetch(
      `${process.env.DATASERVICE_BASEPATH}/v1/${endpoint}?organisation_id=${organisationId}`,
      {
        method: 'POST',
        headers: {
          'x-portkey-api-key': apiKey,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    );

    return {
      verdict: true,
      data: await dataserviceResponse.json(),
      error: null,
    };
  } catch (error) {
    return {
      verdict: true,
      data: null,
      error,
    };
  }
};

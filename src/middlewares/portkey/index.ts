import { Context } from 'hono';
import {
  getDebugLogSetting,
  getMappedCacheType,
  getPortkeyHeaders,
  postResponseHandler,
  preRequestValidator,
  updateHeaders,
  getStreamingMode,
  addBackgroundTask,
} from './utils';
import {
  HEADER_KEYS,
  RESPONSE_HEADER_KEYS,
  CONTENT_TYPES,
  MODES,
  CACHE_STATUS,
  cacheDisabledRoutesRegex,
} from './globals';
import { BaseGuardrail, OrganisationDetails, WinkyLogObject } from './types';
import {
  getStreamModeSplitPattern,
  parseResponse,
  readStream,
} from './handlers/stream';
import { getFromCache } from './handlers/cache';
import { env } from 'hono/adapter';
import {
  createRequestFromPromptData,
  getMappedConfigFromRequest,
  handleVirtualKeyHeader,
  getUniquePromptPartialsFromPromptMap,
  getPromptPartialMap,
  getGuardrailMappedConfig,
} from './handlers/helpers';
import { fetchOrganisationPrompt } from './handlers/albus';
import { hookHandler } from './handlers/hooks';
import { fetchFromKVStore, putInKVStore } from './handlers/kv';
import { realtimeEventLogHandler } from './handlers/realtime';
import {
  handleCircuitBreakerResponse,
  recordCircuitBreakerFailure,
} from './circuitBreaker';
import { fetchOrganisationDetailsFromFile } from './handlers/configFile';

function getContentType(headersObj: any) {
  if ('content-type' in headersObj) {
    return headersObj['content-type'].split(';')[0];
  } else {
    return null;
  }
}

async function getRequestBodyData(req: Request, headersObj: any) {
  const contentType = getContentType(headersObj);
  let bodyJSON: any = {};
  let bodyFormData = new FormData();
  let requestBinary: ArrayBuffer = new ArrayBuffer(0);

  switch (contentType) {
    case CONTENT_TYPES.APPLICATION_JSON: {
      if (req.method === 'GET' || req.method === 'DELETE') {
        bodyJSON = {};
        break;
      }
      bodyJSON = await req.json();
      break;
    }
    case CONTENT_TYPES.MULTIPART_FORM_DATA: {
      bodyFormData = await req.formData();
      bodyFormData.forEach(function (value, key) {
        bodyJSON[key] = value;
      });
      break;
    }
  }
  if (contentType?.startsWith(CONTENT_TYPES.GENERIC_AUDIO_PATTERN)) {
    requestBinary = await req.arrayBuffer();
  }
  return { bodyJSON, bodyFormData, requestBinary };
}

export function getMode(requestHeaders: Record<string, string>, path: string) {
  let mode = requestHeaders[HEADER_KEYS.MODE]?.split(' ')[0] ?? MODES.PROXY;
  if (
    path === '/v1/chatComplete' ||
    path === '/v1/complete' ||
    path === '/v1/embed'
  ) {
    mode = MODES.RUBEUS;
  } else if (
    path === '/v1/chat/completions' ||
    path === '/v1/messages' ||
    path === '/v1/completions' ||
    path === '/v1/embeddings' ||
    path === '/v1/images/generations' ||
    path === '/v1/images/edits' ||
    path === '/v1/audio/speech' ||
    path === '/v1/audio/transcriptions' ||
    path === '/v1/audio/translations' ||
    path.includes('/v1/batches') ||
    path.includes('/v1/fine_tuning') ||
    path.includes('/v1/files') ||
    path.startsWith('/v1/prompts') ||
    path.startsWith('/v1/responses')
  ) {
    mode = MODES.RUBEUS_V2;
  } else if (path.startsWith('/v1/realtime')) {
    mode = MODES.REALTIME;
  } else if (path.indexOf('/v1/proxy') === -1) {
    mode = MODES.PROXY_V2;
  }

  return mode;
}

export const portkey = () => {
  return async (c: Context, next: any) => {
    const reqClone = c.req.raw.clone();
    let headersObj = Object.fromEntries(c.req.raw.headers);
    if (!headersObj[HEADER_KEYS.ORGANISATION_DETAILS]) {
      headersObj[HEADER_KEYS.ORGANISATION_DETAILS] = JSON.stringify(
        await fetchOrganisationDetailsFromFile()
      );
    }

    const url = new URL(c.req.url);
    const path = url.pathname;
    const requestBodyData = await getRequestBodyData(reqClone, headersObj);

    const store: {
      orgDetails: OrganisationDetails;
      [key: string]: any;
    } = {
      bodyJSON: requestBodyData.bodyJSON,
      bodyFormData: requestBodyData.bodyFormData,
      bodyBinary: requestBodyData.requestBinary,
      proxyMode: getMode(headersObj, path),
      orgAPIKey: headersObj[HEADER_KEYS.API_KEY],
      orgDetails: JSON.parse(
        headersObj[HEADER_KEYS.ORGANISATION_DETAILS]
      ) as OrganisationDetails,
      requestMethod: c.req.method,
      requestContentType: getContentType(headersObj),
    };

    try {
      updateHeaders(headersObj, store.orgDetails);
    } catch (err: any) {
      return new Response(
        JSON.stringify({
          status: 'failure',
          message: err.message,
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    const mappedHeaders = new Headers(headersObj);

    let mappedBody = store.bodyJSON;
    let mappedURL = c.req.url;
    const isVirtualKeyUsageEnabled =
      store.orgDetails.settings.is_virtual_key_limit_enabled;

    const {
      input_guardrails: defaultOrganisationInputGuardrails,
      output_guardrails: defaultOrganisationOutputGuardrails,
    } = store.orgDetails?.defaults || {};

    const {
      input_guardrails: defaultWorkspaceInputGuardrails,
      output_guardrails: defaultWorkspaceOutputGuardrails,
    } = store.orgDetails?.workspaceDetails?.defaults || {};

    const defaultInputGuardrails: BaseGuardrail[] = [
      ...(defaultOrganisationInputGuardrails || []).map(
        (eachGuardrail: any) => ({
          slug: eachGuardrail.slug,
          organisationId: store.orgDetails.id,
          workspaceId: null,
        })
      ),
      ...(defaultWorkspaceInputGuardrails || []).map((eachGuardrail: any) => ({
        slug: eachGuardrail.slug,
        organisationId: store.orgDetails.id,
        workspaceId: store.orgDetails.workspaceDetails?.id,
      })),
    ];
    const defaultOutputGuardrails: BaseGuardrail[] = [
      ...(defaultOrganisationOutputGuardrails || []).map(
        (eachGuardrail: any) => ({
          slug: eachGuardrail.slug,
          organisationId: store.orgDetails.id,
          workspaceId: null,
        })
      ),
      ...(defaultWorkspaceOutputGuardrails || []).map((eachGuardrail: any) => ({
        slug: eachGuardrail.slug,
        organisationId: store.orgDetails.id,
        workspaceId: store.orgDetails.workspaceDetails?.id,
      })),
    ];

    const defaultGuardrails: BaseGuardrail[] = [
      ...defaultInputGuardrails,
      ...defaultOutputGuardrails,
    ];

    // start: config mapping
    const {
      status: configStatus,
      message: configStatusMessage,
      mappedConfig,
      configVersion,
      configSlug,
      promptRequestURL,
      guardrailMap = {},
      integrations = [],
      circuitBreakerContext,
    } = await getMappedConfigFromRequest(
      env(c),
      mappedBody,
      mappedHeaders,
      store.orgAPIKey,
      store.orgDetails,
      path,
      isVirtualKeyUsageEnabled, // TODO: Pick this up from orgDetails after guardrails deployment
      mappedHeaders,
      defaultGuardrails
    );

    if (configStatus === 'failure') {
      return new Response(
        JSON.stringify({
          status: 'failure',
          message: configStatusMessage,
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    if (circuitBreakerContext) {
      c.set('handleCircuitBreakerResponse', handleCircuitBreakerResponse);
      c.set('recordCircuitBreakerFailure', recordCircuitBreakerFailure);
    }

    if (defaultGuardrails.length > 0) {
      const mappedDefaultGuardrails = getGuardrailMappedConfig(
        guardrailMap,
        {
          input_guardrails: defaultInputGuardrails?.map(
            (eachGuardrail: BaseGuardrail) => eachGuardrail.slug
          ),
          output_guardrails: defaultOutputGuardrails?.map(
            (eachGuardrail: BaseGuardrail) => eachGuardrail.slug
          ),
        },
        integrations,
        store.orgAPIKey,
        store.orgDetails
      );

      if (mappedDefaultGuardrails.input_guardrails) {
        mappedHeaders.set(
          HEADER_KEYS.DEFAULT_INPUT_GUARDRAILS,
          JSON.stringify(mappedDefaultGuardrails.input_guardrails)
        );
      }
      if (mappedDefaultGuardrails.output_guardrails) {
        mappedHeaders.set(
          HEADER_KEYS.DEFAULT_OUTPUT_GUARDRAILS,
          JSON.stringify(mappedDefaultGuardrails.output_guardrails)
        );
      }
    }
    // add config slug and version in header for winky logging.
    if (configSlug && configVersion) {
      mappedHeaders.set(HEADER_KEYS.CONFIG_SLUG, configSlug);
      mappedHeaders.set(HEADER_KEYS.CONFIG_VERSION, configVersion);
    }

    if (mappedConfig && store.proxyMode === MODES.RUBEUS) {
      mappedBody.config = mappedConfig;
    } else if (mappedConfig) {
      mappedHeaders.set(HEADER_KEYS.CONFIG, JSON.stringify(mappedConfig));
    }
    // end: config mapping

    // start: fetch and map prompt data
    if (c.req.url.includes('/v1/prompts') && !promptRequestURL) {
      const promptSlug = new URL(c.req.url).pathname?.split('/')[3];

      const promptData = await fetchOrganisationPrompt(
        env(c),
        store.orgDetails.id,
        store.orgDetails.workspaceDetails,
        store.orgAPIKey,
        promptSlug,
        headersObj[HEADER_KEYS.REFRESH_PROMPT_CACHE] === 'true'
      );
      if (!promptData) {
        return new Response(
          JSON.stringify({
            status: 'failure',
            message: 'Invalid prompt id',
          }),
          {
            status: 404,
            headers: {
              'Content-Type': 'application/json',
            },
          }
        );
      }

      const { missingVariablePartials, uniquePartials } =
        getUniquePromptPartialsFromPromptMap(
          { [promptSlug]: promptData },
          mappedBody
        );
      if (missingVariablePartials.length) {
        return new Response(
          JSON.stringify({
            status: 'failure',
            message: `Missing variable partials: ${missingVariablePartials.join(
              ', '
            )}`,
          }),
          {
            status: 400,
            headers: {
              'Content-Type': 'application/json',
            },
          }
        );
      }

      const { promptPartialMap, missingPromptPartials } =
        await getPromptPartialMap(
          env(c),
          uniquePartials,
          store.orgAPIKey,
          store.orgDetails.id,
          store.orgDetails.workspaceDetails
        );
      if (missingPromptPartials.length) {
        return new Response(
          JSON.stringify({
            status: 'failure',
            message: `Missing prompt partials: ${missingPromptPartials.join(
              ', '
            )}`,
          }),
          {
            status: 400,
            headers: {
              'Content-Type': 'application/json',
            },
          }
        );
      }
      const {
        requestBody: promptRequestBody,
        requestHeader,
        requestUrl,
        status: promptStatus,
        message: promptStatusMessage,
      } = createRequestFromPromptData(
        env(c),
        promptData,
        promptPartialMap,
        store.bodyJSON,
        promptSlug
      );

      if (promptStatus == 'failure') {
        return new Response(
          JSON.stringify({
            status: 'failure',
            message: promptStatusMessage,
          }),
          {
            status: 400,
            headers: {
              'Content-Type': 'application/json',
            },
          }
        );
      }
      mappedBody = promptRequestBody;

      mappedURL = requestUrl;
      Object.entries(requestHeader ?? {}).forEach(([key, value]) => {
        mappedHeaders.set(key, value);
      });
      mappedHeaders.delete('content-length');
    } else if (c.req.url.includes('/v1/prompts')) {
      delete mappedBody['variables'];
      if (!promptRequestURL) {
        return new Response(
          JSON.stringify({
            status: 'failure',
            message: 'prompt completions error: Something went wrong',
          }),
          {
            status: 500,
            headers: {
              'Content-Type': 'application/json',
            },
          }
        );
      }
      mappedURL = promptRequestURL;
    }
    // end: fetch and map prompt data

    // start: check and map virtual key header
    const handleVirtualKeyHeaderResponse = await handleVirtualKeyHeader(
      env(c),
      store.orgAPIKey,
      store.orgDetails.id,
      store.orgDetails.workspaceDetails,
      mappedHeaders,
      store.proxyMode,
      mappedBody,
      mappedURL
    );

    if (handleVirtualKeyHeaderResponse?.status === 'failure') {
      return new Response(
        JSON.stringify({
          status: 'failure',
          message: handleVirtualKeyHeaderResponse.message,
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }
    // end: check and map virtual key header

    const modifiedFetchOptions: RequestInit = {
      headers: mappedHeaders,
      method: store.requestMethod,
    };

    if (store.requestContentType === CONTENT_TYPES.MULTIPART_FORM_DATA) {
      modifiedFetchOptions.body = store.bodyFormData;
      mappedHeaders.delete('content-type');
    } else if (
      store.requestContentType?.startsWith(CONTENT_TYPES.GENERIC_AUDIO_PATTERN)
    ) {
      modifiedFetchOptions.body = store.requestBinary;
    } else if (
      store.requestMethod !== 'GET' &&
      store.requestMethod !== 'DELETE' &&
      store.requestContentType
    ) {
      modifiedFetchOptions.body = JSON.stringify(mappedBody);
    }

    let modifiedRequest: Request;

    // TODO: Verify if we can just ```new Request(mappedURL, modifiedFetchOptions)``` for both the conditions
    if (path.startsWith('/v1/prompts/')) {
      modifiedRequest = new Request(mappedURL, modifiedFetchOptions);
    } else {
      modifiedRequest = new Request(c.req.raw, modifiedFetchOptions);
    }

    const mappedHeadersObj = Object.fromEntries(mappedHeaders);

    c.req.raw = modifiedRequest;

    let executionStartTimeStamp = Date.now();

    if (!cacheDisabledRoutesRegex.test(path)) {
      c.set('getFromCache', getFromCache);
      c.set('cacheIdentifier', store.orgDetails.id);
    }

    if (c.req.url.includes('/v1/realtime')) {
      c.set('realtimeEventParser', realtimeEventLogHandler);
    }
    c.set('getFromCacheByKey', fetchFromKVStore);
    c.set('putInCacheWithValue', putInKVStore);
    c.set('preRequestValidator', preRequestValidator);

    const headersWithoutPortkeyHeaders = Object.assign(
      {},
      Object.fromEntries(mappedHeaders)
    ); //deep copy
    Object.values(HEADER_KEYS).forEach((eachPortkeyHeader) => {
      delete headersWithoutPortkeyHeaders[eachPortkeyHeader];
    });

    const portkeyHeaders = getPortkeyHeaders(mappedHeadersObj);

    // Main call handler is here
    await next();

    const requestOptionsArray = c.get('requestOptions');
    if (!requestOptionsArray?.length) {
      return;
    }
    const internalTraceId = crypto.randomUUID();

    for (const latestRequestOption of requestOptionsArray) {
      const logId = crypto.randomUUID();
      const provider = latestRequestOption.providerOptions.provider;
      const params = latestRequestOption.requestParams;
      const isStreamingMode = getStreamingMode(
        params,
        provider,
        latestRequestOption.providerOptions.requestURL,
        latestRequestOption.providerOptions.rubeusURL
      );
      const currentTimestamp = Date.now();
      const winkyBaseLog: WinkyLogObject = {
        id: logId,
        createdAt: latestRequestOption.createdAt,
        traceId: portkeyHeaders['x-portkey-trace-id'],
        internalTraceId: internalTraceId,
        requestMethod: store.requestMethod,
        requestURL: latestRequestOption.providerOptions.requestURL,
        rubeusURL: latestRequestOption.providerOptions.rubeusURL,
        finalUntransformedRequest:
          latestRequestOption.finalUntransformedRequest ?? null,
        transformedRequest: latestRequestOption.transformedRequest ?? null,
        requestHeaders: headersWithoutPortkeyHeaders,
        requestBody: JSON.stringify(mappedBody),
        originalResponse: latestRequestOption.originalResponse ?? null,
        requestBodyParams: params,
        responseStatus: latestRequestOption.response.status,
        responseTime: currentTimestamp - executionStartTimeStamp,
        responseHeaders: Object.fromEntries(
          latestRequestOption.response.headers
        ),
        cacheKey: latestRequestOption.cacheKey,
        providerOptions: latestRequestOption.providerOptions,
        debugLogSetting: getDebugLogSetting(portkeyHeaders, store.orgDetails),
        config: {
          organisationDetails: store.orgDetails,
          organisationConfig: {},
          cacheType: getMappedCacheType(latestRequestOption.cacheMode),
          retryCount:
            Number(
              c.res.headers.get(RESPONSE_HEADER_KEYS.RETRY_ATTEMPT_COUNT)
            ) || 0,
          portkeyHeaders: portkeyHeaders,
          proxyMode: store.proxyMode,
          streamingMode: isStreamingMode ?? false,
          cacheStatus: latestRequestOption.cacheStatus ?? CACHE_STATUS.DISABLED,
          provider: provider,
          requestParams: params,
          lastUsedOptionIndex: latestRequestOption.lastUsedOptionIndex,
          internalTraceId: internalTraceId,
          cacheMaxAge: latestRequestOption.cacheMaxAge || null,
        },
      } as WinkyLogObject;
      const responseClone = latestRequestOption.response;
      const isCacheHit = [CACHE_STATUS.HIT, CACHE_STATUS.SEMANTIC_HIT].includes(
        winkyBaseLog.config.cacheStatus
      );
      const isStreamEnabledCacheHit =
        isCacheHit && store.proxyMode === MODES.RUBEUS_V2;
      const responseContentType = responseClone.headers.get('content-type');

      let concatenatedStreamResponse = '';

      if (
        isStreamingMode &&
        [200, 246].includes(responseClone.status) &&
        (!isCacheHit || isStreamEnabledCacheHit)
      ) {
        let splitPattern = '\n\n';
        if ([MODES.PROXY && MODES.PROXY_V2].includes(store.proxyMode)) {
          splitPattern = getStreamModeSplitPattern(
            provider,
            winkyBaseLog.requestURL
          );
        }

        (async () => {
          for await (const chunk of readStream(
            responseClone.body!.getReader(),
            splitPattern,
            undefined
          )) {
            concatenatedStreamResponse += chunk;
          }

          const responseBodyJson = parseResponse(
            concatenatedStreamResponse,
            provider,
            store.proxyMode,
            winkyBaseLog.requestURL,
            winkyBaseLog.rubeusURL
          );
          winkyBaseLog.responseBody = responseBodyJson
            ? JSON.stringify(responseBodyJson)
            : '{ "info": "Portkey logging: Unable to log streaming response" }';
          addBackgroundTask(
            c,
            postResponseHandler(winkyBaseLog, responseBodyJson, env(c))
          );

          const hooksManager = c.get('hooksManager');
          if (hooksManager && responseBodyJson) {
            hooksManager.setSpanContextResponse(
              latestRequestOption.hookSpanId,
              responseBodyJson,
              latestRequestOption.response.status
            );
          }
          addBackgroundTask(
            c,
            hookHandler(
              c,
              latestRequestOption.hookSpanId,
              {
                'x-auth-organisation-details':
                  headersObj[HEADER_KEYS.ORGANISATION_DETAILS],
              },
              winkyBaseLog
            )
          );
        })();
      } else if (
        responseContentType?.startsWith(CONTENT_TYPES.GENERIC_AUDIO_PATTERN) ||
        responseContentType?.startsWith(
          CONTENT_TYPES.APPLICATION_OCTET_STREAM
        ) ||
        responseContentType?.startsWith(CONTENT_TYPES.GENERIC_IMAGE_PATTERN)
      ) {
        const responseBodyJson = {};
        winkyBaseLog.responseBody = JSON.stringify(responseBodyJson);
        addBackgroundTask(
          c,
          postResponseHandler(winkyBaseLog, responseBodyJson, env(c))
        );
      } else if (
        responseContentType?.startsWith(CONTENT_TYPES.PLAIN_TEXT) ||
        responseContentType?.startsWith(CONTENT_TYPES.HTML)
      ) {
        const responseBodyJson = {
          'html-message': await responseClone.text(),
        };
        winkyBaseLog.responseBody = JSON.stringify(responseBodyJson);
        addBackgroundTask(
          c,
          postResponseHandler(winkyBaseLog, responseBodyJson, env(c))
        );
      } else if (!responseContentType && responseClone.status === 204) {
        const responseBodyJson = {};
        winkyBaseLog.responseBody = JSON.stringify(responseBodyJson);
        addBackgroundTask(
          c,
          postResponseHandler(winkyBaseLog, responseBodyJson, env(c))
        );
      } else {
        const promise = new Promise(async (resolve, reject) => {
          const responseBodyJson = await responseClone.json();
          winkyBaseLog.responseBody = JSON.stringify(responseBodyJson);

          await postResponseHandler(winkyBaseLog, responseBodyJson, env(c));
          await hookHandler(
            c,
            latestRequestOption.hookSpanId,
            {
              'x-auth-organisation-details':
                headersObj[HEADER_KEYS.ORGANISATION_DETAILS],
            },
            winkyBaseLog
          );
          resolve(true);
        });
        addBackgroundTask(c, promise);
      }
    }
  };
};

import { Context } from 'hono';
import {
  getDebugLogSetting,
  getMappedCacheType,
  getPortkeyHeaders,
  postResponseHandler,
  preRequestValidator,
  updateHeaders,
  getStreamingMode,
  getMode,
  addBackgroundTask,
  toHeaderSafeJson,
} from './utils';
import {
  PORTKEY_HEADER_KEYS,
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
import { fetchFromKVStore, getFromCache, putInKVStore } from './handlers/cache';
import { env } from 'hono/adapter';
import {
  createRequestFromPromptData,
  getMappedConfigFromRequest,
  handleVirtualKeyHeader,
  getUniquePromptPartialsFromPromptMap,
  getPromptPartialMap,
  getGuardrailMappedConfig,
} from './handlers/helpers';
import { fetchOrganisationPrompt } from '../../services/albus';
import { hookHandler } from './handlers/hooks';
import { realtimeEventLogHandler } from './handlers/realtime';
import { HEADER_KEYS, METRICS_KEYS, POWERED_BY } from '../../globals';
import { getContext, setContext, ContextKeys } from './contextHelpers';
import { endpointStrings } from '../../providers/types';
import {
  handleCircuitBreakerResponse,
  recordCircuitBreakerFailure,
} from '../../utils/circuitBreaker';
import { version } from '../../../package.json';
import { deriveTimingMetrics } from './utils/metrics';
import { fetchOrganisationDetailsFromFile } from '../../services/albus/configFile';
import { Environment } from '../../utils/env';

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
  let bodyFormData = null;
  let requestBinary = null;

  switch (contentType) {
    case CONTENT_TYPES.APPLICATION_JSON: {
      if (req.method === 'GET' || req.method === 'DELETE') {
        bodyJSON = {};
        break;
      }
      try {
        bodyJSON = await req.json();
      } catch (err: unknown) {
        bodyJSON = {};
      }
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
  if (
    contentType?.startsWith(CONTENT_TYPES.GENERIC_AUDIO_PATTERN) ||
    contentType?.startsWith(CONTENT_TYPES.APPLICATION_OCTET_STREAM) ||
    contentType === CONTENT_TYPES.PROTOBUF
  ) {
    requestBinary = await req.arrayBuffer();
  }
  return { bodyJSON, bodyFormData, requestBinary };
}

const skipIgnoreLogCheck = (path: string, method: string) => {
  return (
    method === 'POST' &&
    (path === '/v1/batches' ||
      path === '/v1/fine_tuning/jobs' ||
      path === '/v1/files')
  );
};

export const portkey = () => {
  return async (c: Context, next: any) => {
    c.set(METRICS_KEYS.PORTKEY_MIDDLEWARE_PRE_REQUEST_START, Date.now());
    const headersObj = c.get('headersObj');
    if (
      !getContext(c, ContextKeys.ORGANISATION_DETAILS) &&
      Environment({}).FETCH_SETTINGS_FROM_FILE === 'true'
    ) {
      const orgDetailsFromFile = await fetchOrganisationDetailsFromFile();
      setContext(
        c,
        ContextKeys.ORGANISATION_DETAILS,
        orgDetailsFromFile as OrganisationDetails
      );
      headersObj[HEADER_KEYS.ORGANISATION_DETAILS] =
        toHeaderSafeJson(orgDetailsFromFile);
    }

    const url = new URL(c.req.url);
    const path = url.pathname;
    const requestBodyParsingStartTime = Date.now();
    let requestBodyData: any = {};
    // Skip body parsing only for file upload endpoint (POST /v1/files) which streams multipart form data.
    // Other endpoints containing "files" in the path (e.g., /v1/vector_stores/{id}/files) use JSON bodies
    // and need normal parsing.
    const isFileUploadEndpoint =
      path === '/v1/files' && c.req.method === 'POST';
    if (!isFileUploadEndpoint) {
      requestBodyData = await getRequestBodyData(
        c.req.raw,
        Object.fromEntries(c.req.raw.headers)
      );
    } else {
      requestBodyData = {
        bodyJSON: {},
        bodyFormData: null,
        requestBinary: null,
      };
    }
    const requestBodyParsingEndTime = Date.now();
    const preProcessingStartTime = Date.now();
    const store: {
      orgDetails: OrganisationDetails;
      [key: string]: any;
    } = {
      bodyJSON: requestBodyData.bodyJSON,
      bodyFormData: requestBodyData.bodyFormData,
      bodyBinary: requestBodyData.requestBinary,
      proxyMode: getMode(headersObj, path),
      orgAPIKey: headersObj[PORTKEY_HEADER_KEYS.API_KEY],
      orgDetails: getContext(
        c,
        ContextKeys.ORGANISATION_DETAILS
      ) as OrganisationDetails,
      requestMethod: c.req.method,
      requestContentType: getContentType(headersObj),
    };

    try {
      updateHeaders(headersObj, store.orgDetails, path);
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
    const {
      input_guardrails: defaultOrganisationInputGuardrails,
      output_guardrails: defaultOrganisationOutputGuardrails,
    } = store.orgDetails?.organisationDefaults || {};

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
      configId,
      promptCompletionsEndpoint,
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
      mappedHeaders,
      defaultGuardrails,
      c.req.url
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

    if (promptCompletionsEndpoint) {
      c.set('promptCompletionsEndpoint', promptCompletionsEndpoint);
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
          PORTKEY_HEADER_KEYS.DEFAULT_INPUT_GUARDRAILS,
          toHeaderSafeJson(mappedDefaultGuardrails.input_guardrails)
        );
      }
      if (mappedDefaultGuardrails.output_guardrails) {
        mappedHeaders.set(
          PORTKEY_HEADER_KEYS.DEFAULT_OUTPUT_GUARDRAILS,
          toHeaderSafeJson(mappedDefaultGuardrails.output_guardrails)
        );
      }
    }

    // add config slug, version and id in header for winky logging.
    if (configSlug && configVersion) {
      mappedHeaders.set(PORTKEY_HEADER_KEYS.CONFIG_SLUG, configSlug);
      mappedHeaders.set(PORTKEY_HEADER_KEYS.CONFIG_VERSION, configVersion);
      if (configId) {
        mappedHeaders.set(PORTKEY_HEADER_KEYS.CONFIG_ID, configId);
      }
    }

    if (mappedConfig && store.proxyMode === MODES.RUBEUS) {
      mappedBody.config = mappedConfig;
    } else if (mappedConfig) {
      mappedHeaders.set(
        PORTKEY_HEADER_KEYS.CONFIG,
        toHeaderSafeJson(mappedConfig)
      );
    }
    // end: config mapping

    // 1. Check if the request is a batch/file
    // 2. Mapped Config.Targets should not be set, return 400 if set
    // 3. Check if x-portkey-provider, x-portkey-virtual-key headers,  Check Mapped Config.provider are present
    // 4. If not set x-portkey-provider to PORTKEY
    if (
      path.includes('/v1/files') ||
      path.includes('/v1/batches') ||
      path.includes('/v1/fine_tuning')
    ) {
      if (
        mappedConfig?.targets?.length > 1 &&
        env(c).SKIP_DATAPLANE_CONFIG_CHECK !== 'true'
      ) {
        return new Response(
          JSON.stringify({
            status: 'failure',
            message:
              'Invalid config provided. Maximum one target is allowed for batch/file/fine_tuning requests',
          }),
          {
            status: 400,
            headers: {
              'Content-Type': 'application/json',
            },
          }
        );
      } else if (
        !mappedHeaders.get(PORTKEY_HEADER_KEYS.PROVIDER) &&
        !mappedHeaders.get(PORTKEY_HEADER_KEYS.VIRTUAL_KEY) &&
        !mappedConfig?.provider
      ) {
        mappedHeaders.set(PORTKEY_HEADER_KEYS.PROVIDER, POWERED_BY);
      }
    }
    const isPromptCompletions =
      c.req.url.includes('/v1/prompts') &&
      (c.req.url.endsWith('/completions') || c.req.url.endsWith('/render'));
    // start: fetch and map prompt data
    if (isPromptCompletions && !promptCompletionsEndpoint) {
      const promptSlug = new URL(c.req.url).pathname?.split('/')[3];

      const promptData = await fetchOrganisationPrompt(
        env(c),
        store.orgDetails.id,
        store.orgDetails.workspaceDetails,
        store.orgAPIKey,
        promptSlug,
        headersObj[PORTKEY_HEADER_KEYS.REFRESH_PROMPT_CACHE] === 'true'
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
            message: `Missing variable partials: ${missingVariablePartials.join(', ')}`,
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
            message: `Missing prompt partials: ${missingPromptPartials.join(', ')}`,
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
        endpoint,
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
      const isRender = c.req.url.endsWith('/render');
      if (isRender) {
        return new Response(
          JSON.stringify({
            success: true,
            data: mappedBody,
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
            },
          }
        );
      }
      if (endpoint) {
        c.set('promptCompletionsEndpoint', endpoint);
      }
      Object.entries(requestHeader ?? {}).forEach(([key, value]) => {
        mappedHeaders.set(key, value);
      });
      mappedHeaders.delete('content-length');
    } else if (isPromptCompletions) {
      delete mappedBody['variables'];
      if (!promptCompletionsEndpoint) {
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
      c.req.url
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

    const mappedHeadersObj = Object.fromEntries(mappedHeaders);
    c.set('mappedHeaders', mappedHeadersObj);
    c.set('requestBodyData', {
      bodyJSON: mappedBody,
      bodyFormData: store.bodyFormData,
      requestBinary: store.bodyBinary,
    });

    const executionStartTimeStamp = Date.now();

    if (!cacheDisabledRoutesRegex.test(path)) {
      c.set('getFromCache', getFromCache);
      c.set('cacheIdentifier', store.orgDetails.id);
    }

    if (c.req.url.includes('/v1/realtime')) {
      c.set('realtimeEventParser', realtimeEventLogHandler);
    }

    c.set('getFromCacheByKey', (key: string, useMemCache: boolean = false) =>
      fetchFromKVStore(env(c), key, useMemCache)
    );
    c.set('putInCacheWithValue', (key: string, value: any, expiry?: number) =>
      putInKVStore(env(c), key, value, expiry)
    );

    c.set('preRequestValidator', preRequestValidator);

    const headersWithoutPortkeyHeaders = Object.assign(
      {},
      Object.fromEntries(mappedHeaders)
    ); //deep copy
    Object.values(PORTKEY_HEADER_KEYS).forEach((eachPortkeyHeader) => {
      delete headersWithoutPortkeyHeaders[eachPortkeyHeader];
    });

    const portkeyHeaders = getPortkeyHeaders(mappedHeadersObj);

    const preProcessingEndTime = Date.now();
    c.set(
      METRICS_KEYS.PORTKEY_MIDDLEWARE_PRE_REQUEST_END,
      preProcessingEndTime
    );
    // Main call handler is here
    await next();

    c.set(METRICS_KEYS.PORTKEY_MIDDLEWARE_POST_REQUEST_START, Date.now());

    const requestOptionsArray = c.get('requestOptions');
    if (!requestOptionsArray?.length) {
      return;
    }
    const internalTraceId = crypto.randomUUID();

    const ignoreLog =
      portkeyHeaders[PORTKEY_HEADER_KEYS.IGNORE_SERVICE_LOG] === 'true' &&
      !skipIgnoreLogCheck(path, c.req.method);
    if (ignoreLog) {
      return;
    }

    const requestParsingTime =
      requestBodyParsingEndTime - requestBodyParsingStartTime;
    const preProcessingTime = preProcessingEndTime - preProcessingStartTime;
    const authNStartTime = c.get(METRICS_KEYS.AUTH_N_MIDDLEWARE_START);
    const authNEndTime = c.get(METRICS_KEYS.AUTH_N_MIDDLEWARE_END);
    let authNLatency = 0;
    if (authNStartTime && authNEndTime) {
      authNLatency = authNEndTime - authNStartTime;
    }

    const finalRequestOptionIndex = requestOptionsArray.length - 1;
    const finalRequestOption = requestOptionsArray[finalRequestOptionIndex];
    let finalResponseForLog: Response | undefined;
    const isStreamingMode = getStreamingMode(
      finalRequestOption.requestParams,
      finalRequestOption.providerOptions.provider,
      finalRequestOption.providerOptions.requestURL
    );
    if (finalRequestOption?.response?.body && isStreamingMode) {
      const [clientBody, loggingBody] = finalRequestOption.response.body.tee();
      const clientResponse = new Response(
        clientBody,
        finalRequestOption.response
      );
      finalResponseForLog = new Response(
        loggingBody,
        finalRequestOption.response
      );
      finalRequestOption.response = clientResponse;
      c.res = clientResponse;
    } else {
      finalResponseForLog = finalRequestOption.response.clone();
    }

    const postResponseTask = (async () => {
      for (let i = 0; i < requestOptionsArray.length; i++) {
        const latestRequestOption = requestOptionsArray[i];
        const timingMetrics = deriveTimingMetrics(
          i,
          latestRequestOption,
          requestParsingTime,
          preProcessingTime,
          authNLatency
        );
        const logId = crypto.randomUUID();
        const provider = latestRequestOption.providerOptions.provider;
        const params = latestRequestOption.requestParams;
        const isStreamingMode = getStreamingMode(
          params,
          provider,
          latestRequestOption.providerOptions.requestURL
        );
        // try min of both (target and org cache ttl), if any one is not set choose the valid one, else default will be set in later points.
        const cacheMaxAge =
          store.orgDetails.settings.cache_ttl && latestRequestOption.cacheMaxAge
            ? Math.min(
                Number(store.orgDetails.settings.cache_ttl),
                latestRequestOption.cacheMaxAge
              )
            : store.orgDetails.settings.cache_ttl ||
              latestRequestOption.cacheMaxAge;
        const currentTimestamp = Date.now();
        const winkyBaseLog: WinkyLogObject = {
          id: logId,
          createdAt: latestRequestOption.createdAt,
          upstreamResponseTime: timingMetrics.upstreamResponseTime,
          timeToLastToken: timingMetrics.timeToLastToken,
          traceId: portkeyHeaders['x-portkey-trace-id'],
          internalTraceId: internalTraceId,
          requestMethod: store.requestMethod,
          requestURL: latestRequestOption.providerOptions.requestURL,
          rubeusURL: latestRequestOption.providerOptions.rubeusURL,
          finalUntransformedRequest:
            latestRequestOption.finalUntransformedRequest ?? null,
          transformedRequest: latestRequestOption.transformedRequest ?? null,
          requestHeaders: headersWithoutPortkeyHeaders,
          requestBody: mappedBody,
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
          gatewayVersion: version,
          requestParsingTime: timingMetrics.requestParsingTime,
          preProcessingTime: timingMetrics.preProcessingTime,
          cacheExecutionTime: timingMetrics.cacheExecutionTime,
          responseParsingTime: timingMetrics.responseParsingTime,
          gatewayProcessingTime: timingMetrics.gatewayProcessingTime,
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
            cacheStatus:
              latestRequestOption.cacheStatus ?? CACHE_STATUS.DISABLED,
            provider: provider,
            requestParams: params,
            lastUsedOptionIndex: latestRequestOption.lastUsedOptionIndex,
            internalTraceId: internalTraceId,
            cacheMaxAge: cacheMaxAge || null,
          },
        } as WinkyLogObject;

        const responseForLog =
          i === finalRequestOptionIndex && finalResponseForLog
            ? finalResponseForLog
            : latestRequestOption.response;

        const isCacheHit = [
          CACHE_STATUS.HIT,
          CACHE_STATUS.SEMANTIC_HIT,
        ].includes(winkyBaseLog.config.cacheStatus);
        const isStreamEnabledCacheHit =
          isCacheHit && store.proxyMode === MODES.RUBEUS_V2;
        const responseContentType = responseForLog.headers.get('content-type');

        let concatenatedStreamResponse = '';

        if (
          isStreamingMode &&
          [200, 246].includes(responseForLog.status) &&
          (!isCacheHit || isStreamEnabledCacheHit)
        ) {
          let splitPattern = '\n\n';
          if ([MODES.PROXY && MODES.PROXY_V2].includes(store.proxyMode)) {
            splitPattern = getStreamModeSplitPattern(
              provider,
              winkyBaseLog.requestURL,
              winkyBaseLog.rubeusURL as endpointStrings
            );
          }

          for await (const chunk of readStream(
            responseForLog.body!.getReader(),
            splitPattern,
            undefined
          )) {
            concatenatedStreamResponse += chunk;
          }
          winkyBaseLog.timeToLastToken =
            Date.now() - winkyBaseLog.createdAt.getTime();
          const responseBodyJson = parseResponse(
            concatenatedStreamResponse,
            provider,
            store.proxyMode,
            winkyBaseLog.requestURL,
            winkyBaseLog.rubeusURL as endpointStrings
          );
          winkyBaseLog.responseBody = responseBodyJson
            ? responseBodyJson
            : { error: 'Portkey error:Unable to parse streaming response' };
          await postResponseHandler(winkyBaseLog, responseBodyJson, env(c), c);

          const hooksManager = c.get('hooksManager');
          if (hooksManager) {
            hooksManager.setSpanContextResponse(
              latestRequestOption.hookSpanId,
              responseBodyJson,
              latestRequestOption.response.status
            );
          }
          await hookHandler(
            c,
            latestRequestOption.hookSpanId,
            {
              [PORTKEY_HEADER_KEYS.ORGANISATION_DETAILS]:
                headersObj[PORTKEY_HEADER_KEYS.ORGANISATION_DETAILS],
            },
            winkyBaseLog
          );
        } else if (
          responseContentType?.startsWith(
            CONTENT_TYPES.GENERIC_AUDIO_PATTERN
          ) ||
          responseContentType?.startsWith(
            CONTENT_TYPES.APPLICATION_OCTET_STREAM
          ) ||
          responseContentType?.startsWith(CONTENT_TYPES.GENERIC_IMAGE_PATTERN)
        ) {
          const responseBodyJson = {};
          winkyBaseLog.responseBody = responseBodyJson;
          await postResponseHandler(winkyBaseLog, responseBodyJson, env(c), c);
        } else if (
          responseContentType?.startsWith(CONTENT_TYPES.PLAIN_TEXT) ||
          responseContentType?.startsWith(CONTENT_TYPES.HTML) ||
          responseContentType?.startsWith(CONTENT_TYPES.XML) ||
          responseContentType?.toLowerCase()?.includes('xml')
        ) {
          const responseBodyJson = {
            'html-message': await responseForLog.text(),
          };
          winkyBaseLog.responseBody = responseBodyJson;
          await postResponseHandler(winkyBaseLog, responseBodyJson, env(c), c);
        } else if (!responseContentType && responseForLog.status === 204) {
          const responseBodyJson = {};
          winkyBaseLog.responseBody = responseBodyJson;
          await postResponseHandler(winkyBaseLog, responseBodyJson, env(c), c);
        } else {
          const responseBodyJson = (await responseForLog.json()) as Record<
            string,
            any
          >;
          winkyBaseLog.responseBody = responseBodyJson;
          await postResponseHandler(winkyBaseLog, responseBodyJson, env(c), c);

          if (latestRequestOption.hookSpanId) {
            await hookHandler(
              c,
              latestRequestOption.hookSpanId,
              {
                [PORTKEY_HEADER_KEYS.ORGANISATION_DETAILS]:
                  headersObj[PORTKEY_HEADER_KEYS.ORGANISATION_DETAILS],
              },
              winkyBaseLog
            );
          }
        }
      }
    })();

    addBackgroundTask(c, postResponseTask);
    c.set(METRICS_KEYS.PORTKEY_MIDDLEWARE_POST_REQUEST_END, Date.now());
  };
};

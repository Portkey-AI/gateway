import { getFromMongo, logToMongo } from './libs/mongo';
import { logToClickhouse } from './libs/clickhouse';
import { findApiKey, sanitiseURL } from './lookers/apiKey';
import {
  generateMetricObject,
  getLogFilePath,
  getURL,
  hash,
  maskHookSensitiveFields,
  maskNestedConfig,
} from './utils/helpers';
import { calculateCost } from './lookers/cost';
import { sanitize } from './utils/sanitise';
import Providers from '../../providers/index';
import { getFromWasabi, uploadToWasabi } from './libs/wasabi';
import {
  ANALYTICS_STORES,
  LOG_STORES,
  UNIFIED_FORM_DATA_ROUTES,
} from './utils/constants';
import {
  getFromGcs,
  getFromGcsAssumed,
  uploadToGcs,
  uploadToGcsAssumed,
} from './libs/gcs';
import {
  getFromS3,
  getFromS3Assumed,
  uploadToS3,
  uploadToS3Assumed,
} from './libs/s3';
import {
  PORTKEY_HEADER_KEYS,
  PROVIDER_HEADER_KEYS,
} from '../../middlewares/portkey/globals';
import { HEADER_KEYS } from '../../globals';
import { logger } from '../../apm';
import { getLogsFromAzureStorage, uploadToAzureStorage } from './libs/azure';
import { getFromNetapp, uploadToNetapp } from './libs/netapp';
import {
  AnalyticsLogObject,
  AnalyticsLogObjectV2,
  AnalyticsOptions,
  LogOptions,
  LogStoreApmOptions,
} from '../../middlewares/portkey/types';
import { hookResultsLogHandler } from './handlers/hookResultsHandler';
import {
  getCustomLabels,
  llmCostSum,
  llmTokenSum,
} from '../../apm/prometheus/prometheusClient';
import {
  logAnalyticsToControlPlane,
  uploadLogsToControlPlane,
} from './libs/controlPlane';
import { getFromCustomS3, uploadToCustomS3 } from './libs/customS3';
import { getPricingConfig } from './handlers/modelConfig';
import { handlePostRequestUsage } from './lookers/usage';
import { handlePostRequestRateLimits } from './lookers/rateLimits';

const portkeyHeadersToBeRemoved = [PORTKEY_HEADER_KEYS.VIRTUAL_KEY_DETAILS];
import { Environment } from '../../utils/env';
import { pushWinkyLogToOtelCollector } from './libs/openTelemetry';
import { mcpLogHandler } from './handlers/mcpLogHandler';
import { LogConfig } from '../../providers/types';
import { DefaultLogConfig } from '../../providers/open-ai-base/pricing';
import { getRuntimeKey } from 'hono/adapter';
import { resyncOrganisationData } from '../albus';

const CUSTOM_HEADERS_TO_MASK =
  Environment({}).ORGANISATION_HEADERS_TO_MASK?.split(',') || [];

const runtime = getRuntimeKey();

const requestHeadersToBeMasked = [
  'authorization',
  PORTKEY_HEADER_KEYS.API_KEY,
  HEADER_KEYS.API_KEY,
  HEADER_KEYS.X_API_KEY,
  PORTKEY_HEADER_KEYS.BEDROCK_SECRET_ACCESS_KEY,
  PORTKEY_HEADER_KEYS.BEDROCK_ACCESS_KEY_ID,
  PORTKEY_HEADER_KEYS.AWS_EXTERNAL_ID,
  PORTKEY_HEADER_KEYS.AWS_ROLE_ARN,
  PORTKEY_HEADER_KEYS.VERTEX_SERVICE_ACCOUNT_JSON,
  PORTKEY_HEADER_KEYS.AZURE_ENTRA_CLIENT_SECRET,
  PROVIDER_HEADER_KEYS.MODAL_KEY,
  PROVIDER_HEADER_KEYS.MODAL_SECRET,
  ...CUSTOM_HEADERS_TO_MASK,
];

const modelsToSkipSavingReponseBody: Record<string, string[]> = {
  openai: [
    'text-embedding-ada-002',
    'text-embedding-3-small',
    'text-embedding-3-large',
  ],
  'azure-openai': [
    'text-embedding-ada-002',
    'text-embedding-3-small',
    'text-embedding-3-large',
  ],
  nomic: ['nomic-embed-text-v1'],
  anyscale: ['BAAI/bge-large-en-v1.5', 'thenlper/gte-large'],
  google: ['embedding-001'],
  'together-ai': [
    'togethercomputer/m2-bert-80M-2k-retrieval',
    'togethercomputer/m2-bert-80M-8k-retrieval',
    'togethercomputer/m2-bert-80M-32k-retrieval',
    'WhereIsAI/UAE-Large-V1',
    'BAAI/bge-large-en-v1.5',
    'BAAI/bge-base-en-v1.5',
    'sentence-transformers/msmarco-bert-base-dot-v5',
    'bert-base-uncased',
  ],
  'mistral-ai': ['mistral-embed'],
  bedrock: [
    'amazon.titan-embed-text-v1',
    'cohere.embed-english-v3',
    'cohere.embed-multilingual-v3',
  ],
  jina: [
    'jina-embeddings-v2-base-en',
    'jina-embeddings-v2-base-code',
    'jina-embeddings-v2-base-zh',
    'jina-embeddings-v2-base-de',
    'jina-embeddings-v2-base-es',
  ],
  'vertex-ai': ['multimodalembedding', 'multimodalembedding@001'],
};

export async function uploadToLogStore(
  requestBody: Record<string, any> | Record<string, any>[],
  type: string,
  isServiceRequest: boolean,
  env: Record<string, any>,
  req?: {
    headers: Headers;
    method: string;
    url: string;
  },
  overrideLogUsage?: boolean
) {
  let isCustomLog = false;

  if (type === 'hookResults') {
    return isServiceRequest
      ? hookResultsLogHandler(
          env,
          requestBody,
          uploadLogToAnalyticsStore,
          uploadLogToLogStore
        )
      : new Response('Unauthorized request', { status: 401 });
  }

  if (type === 'mcp') {
    return isServiceRequest
      ? mcpLogHandler(env, requestBody)
      : new Response('Unauthorized request', { status: 401 });
  }

  if (req) {
    const url = new URL(req.url);
    if (url.pathname == '/v1/logs' || url.pathname == '/v1/otel/v1/traces') {
      // When the log request is coming directly via API
      isCustomLog = true;
    }
  }
  const spanBodies = Array.isArray(requestBody) ? requestBody : [requestBody];
  const analyticsObjects = [];
  const internalTraceId = crypto.randomUUID();
  const logUsage = !isCustomLog || overrideLogUsage;
  for (let spanBody of spanBodies) {
    if (isCustomLog && req) {
      spanBody = customLogTransform(req, spanBody, env, internalTraceId);
    }
    const response = await handleSpanLog(
      env,
      spanBody,
      internalTraceId,
      isServiceRequest,
      logUsage
    );
    if (response.response) {
      return response.response;
    }
    analyticsObjects.push(response.analyticsLogObject);
  }

  if (analyticsObjects.length > 0) {
    const clickhouseSettings =
      spanBodies[0].config?.organisationDetails?.enterpriseSettings
        ?.clickhouse_settings;
    const analyticsOptions: AnalyticsOptions = {
      table: Environment(env).ANALYTICS_LOG_TABLE || 'generations',
      server: clickhouseSettings?.server,
      database: clickhouseSettings?.name,
    };
    await uploadLogToAnalyticsStore(env, analyticsObjects, analyticsOptions);
  }
  return new Response('ok', { status: 200 });
}

async function handleSpanLog(
  env: Record<string, any>,
  requestBody: Record<string, any>,
  internalTraceId: string,
  isServiceRequest: boolean,
  logUsage = false
): Promise<{ response?: Response; analyticsLogObject: AnalyticsLogObjectV2 }> {
  const store: Record<string, any> = {
    incomingBody: {},
    portkeyHeaders: {},
    proxyProvider: '',
    proxyMode: '',
    output: null,
    tokens: {
      reqUnits: 0,
      resUnits: 0,
      cacheWriteInputUnits: 0,
      cacheReadInputUnits: 0,
      cacheReadAudioInputUnits: 0,
      resAudioUnits: 0,
      resTextUnits: 0,
      reqTextUnits: 0,
      reqAudioUnits: 0,
      additionalUnits: {
        search: 0,
        web_search_low_context: 0,
        web_search_medium_context: 0,
        web_search_high_context: 0,
        file_search: 0,
        video_duration_seconds_720_1280: 0,
        video_duration_seconds_1280_720: 0,
        video_duration_seconds_1024_1792: 0,
        video_duration_seconds_1792_1024: 0,
        video_duration_seconds: 0,
      },
    },
  };

  const chLogObject: AnalyticsLogObject = {
    id: {
      type: 'string',
      value: null,
      isNullable: false,
    }, //required //UUID
    organisation_id: {
      type: 'string',
      value: null,
      isNullable: false,
    }, //required //string
    organisation_name: {
      type: 'string',
      value: null,
      isNullable: false,
    }, //string
    user_id: {
      type: 'string',
      value: null,
      isNullable: false,
    }, //UUID
    prompt_id: {
      type: 'string',
      value: null,
      isNullable: false,
    },
    prompt_version_id: {
      type: 'string',
      value: null,
      isNullable: false,
    },
    config_id: {
      type: 'string',
      value: null,
      isNullable: false,
    },
    created_at: {
      type: 'string',
      value: null,
      isNullable: false,
    }, //required //datetime
    is_success: {
      type: 'int',
      value: null,
      isNullable: false,
    }, //int
    ai_org: {
      type: 'string',
      value: null,
      isNullable: false,
    }, //string
    ai_org_auth_hash: {
      type: 'string',
      value: null,
      isNullable: false,
    }, //required
    ai_model: {
      type: 'string',
      value: null,
      isNullable: false,
    }, //required
    req_units: {
      type: 'int',
      value: null,
      isNullable: false,
    }, //int
    res_units: {
      type: 'int',
      value: null,
      isNullable: false,
    }, //int
    total_units: {
      type: 'int',
      value: null,
      isNullable: false,
    }, //int
    cost: {
      type: 'float',
      value: null,
      isNullable: false,
    }, //float
    cost_currency: {
      type: 'string',
      value: null,
      isNullable: false,
    }, //string
    request_url: {
      type: 'string',
      value: null,
      isNullable: false,
    }, //string
    request_method: {
      type: 'string',
      value: null,
      isNullable: false,
    }, //string
    response_status_code: {
      type: 'int',
      value: null,
      isNullable: false,
    }, //required //int
    response_time: {
      type: 'int',
      value: null,
      isNullable: false,
    }, //int
    is_proxy_call: {
      type: 'int',
      value: null,
      isNullable: false,
    }, //int
    cache_status: {
      type: 'string',
      value: null,
      isNullable: false,
    }, //string
    cache_type: {
      type: 'string',
      value: null,
      isNullable: false,
    }, //string
    stream_mode: {
      type: 'int',
      value: null,
      isNullable: false,
    }, //int
    retry_success_count: {
      type: 'string',
      value: null,
      isNullable: false,
    },
    _environment: {
      type: 'string',
      value: null,
      isNullable: false,
    }, //string
    _user: {
      type: 'string',
      value: null,
      isNullable: false,
    }, //string
    _organisation: {
      type: 'string',
      value: null,
      isNullable: false,
    }, //string
    _prompt: {
      type: 'string',
      value: null,
      isNullable: false,
    }, //string
    trace_id: {
      type: 'string',
      value: null,
      isNullable: false,
    }, //string
    span_id: {
      type: 'string',
      value: null,
      isNullable: false,
    }, //string
    span_name: {
      type: 'string',
      value: null,
      isNullable: false,
    }, //string
    parent_span_id: {
      type: 'string',
      value: null,
      isNullable: false,
    }, //string
    extra_key: {
      type: 'string',
      value: null,
      isNullable: false,
    }, //string
    extra_value: {
      type: 'string',
      value: null,
      isNullable: false,
    },
    mode: {
      type: 'string',
      value: '',
      isNullable: false,
    },
    virtual_key: {
      type: 'string',
      value: '',
      isNullable: false,
    },
    source: {
      type: 'string',
      value: '',
      isNullable: false,
    },
    runtime: {
      type: 'string',
      value: '',
      isNullable: false,
    },
    runtime_version: {
      type: 'string',
      value: '',
      isNullable: false,
    },
    sdk_version: {
      type: 'string',
      value: '',
      isNullable: false,
    },
    config: {
      type: 'string',
      value: '',
      isNullable: false,
    },
    internal_trace_id: {
      type: 'string',
      value: null,
      isNullable: false,
    },
    last_used_option_index: {
      type: 'number',
      value: 0,
      isNullable: false,
    },
    config_version_id: {
      type: 'string',
      value: '',
      isNullable: false,
    },
    prompt_slug: {
      type: 'string',
      value: '',
      isNullable: false,
    },
    workspace_slug: {
      type: 'string',
      value: null,
      isNullable: false,
    }, //UUID
    log_store_file_path_format: {
      type: 'string',
      value: 'v1',
      isNullable: false,
    }, //string - stores the path format version
    'metadata.key': {
      type: 'array',
      value: null,
      isNullable: true,
    },
    'metadata.value': {
      type: 'array',
      value: null,
      isNullable: true,
    },
    api_key_id: {
      type: 'string',
      value: null,
      isNullable: false,
    },
    request_parsing_time: {
      type: 'int',
      value: 0,
      isNullable: false,
    },
    pre_processing_time: {
      type: 'int',
      value: 0,
      isNullable: false,
    },
    cache_processing_time: {
      type: 'int',
      value: 0,
      isNullable: false,
    },
    response_parsing_time: {
      type: 'int',
      value: 0,
      isNullable: false,
    },
    gateway_version: {
      type: 'string',
      value: '',
      isNullable: false,
    },
    ttlt: {
      type: 'int',
      value: 0,
      isNullable: false,
    },
    gateway_processing_time: {
      type: 'int',
      value: 0,
      isNullable: false,
    },
    upstream_response_time: {
      type: 'int',
      value: 0,
      isNullable: false,
    },
  };
  const logObject: {
    _id: string | null;
    request: Record<string, any>;
    response: Record<string, any>;
    organisation_id: string | null;
    created_at: string | Date | null;
    metrics?: Record<string, any>;
    finalUntransformedRequest?: Record<string, any>;
    originalResponse?: Record<string, any>;
    transformedRequest?: Record<string, any>;
  } = {
    _id: null,
    request: {},
    response: {},
    organisation_id: null,
    created_at: null,
    metrics: undefined,
  };

  //find the must have values required for logging
  let providerLogConfig: LogConfig;
  try {
    store.incomingBody = requestBody;
    store.requestHeaders = store.incomingBody.requestHeaders || {};
    store.cacheKey = store.incomingBody.cacheKey;

    store.portkeyHeaders = store.incomingBody.config.portkeyHeaders;

    store.organisationDetails = store.incomingBody.config.organisationDetails;
    //copy x-potkey-api-key before hashing to make albus call for referral key update
    // for Jwt tokens use the temp key generated
    store[PORTKEY_HEADER_KEYS.API_KEY] =
      store.organisationDetails.apiKeyDetails?.key ||
      store.portkeyHeaders[PORTKEY_HEADER_KEYS.API_KEY];

    requestHeadersToBeMasked.forEach((header) => {
      if (store.portkeyHeaders[header]) {
        store.portkeyHeaders[header] = hash(store.portkeyHeaders[header]);
      }
    });
    store.proxyProvider =
      store.incomingBody.config?.provider ??
      store.portkeyHeaders[PORTKEY_HEADER_KEYS.MODE]?.split(' ')[1] ??
      '';
    providerLogConfig =
      Providers[store.proxyProvider]?.pricing || DefaultLogConfig;
    store.proxyMode =
      store.incomingBody.config.proxyMode ??
      store.portkeyHeaders[PORTKEY_HEADER_KEYS.MODE]?.split(' ')[0] ??
      'rubeus';
    store.requestURL = store.incomingBody.requestURL
      ? getURL(store.incomingBody.requestURL, providerLogConfig.getBaseURL())
      : '';
    store.rubeusURL = store.incomingBody.rubeusURL;
    store.requestMethod = store.incomingBody.requestMethod;
    store.requestBody = store.incomingBody.requestBody;

    store.lastUsedOptionIndex = store.incomingBody.config.lastUsedOptionIndex;
    chLogObject.last_used_option_index.value = isNaN(store.lastUsedOptionIndex)
      ? -1
      : store.lastUsedOptionIndex;
    if (isNaN(store.lastUsedOptionIndex)) {
      store.lastUsedOptionJsonPath = store.lastUsedOptionIndex;
    }

    chLogObject.trace_id.value =
      store.portkeyHeaders[PORTKEY_HEADER_KEYS.TRACE_ID];
    chLogObject.span_id.value =
      store.portkeyHeaders[PORTKEY_HEADER_KEYS.SPAN_ID];
    chLogObject.span_name.value =
      store.portkeyHeaders[PORTKEY_HEADER_KEYS.SPAN_NAME];
    chLogObject.parent_span_id.value =
      store.portkeyHeaders[PORTKEY_HEADER_KEYS.PARENT_SPAN_ID];

    if (store.requestBody?.config?.options) {
      store.requestBody.config.options.forEach(function (
        o: {
          virtual_key: string;
          trace_id: string;
          span_id: string;
          span_name: string;
          parent_span_id: string;
          metadata: Record<string, any>;
          apiKey: null;
        },
        i: Record<string, any>
      ) {
        if (i === store.lastUsedOptionIndex) {
          chLogObject.virtual_key.value = o.virtual_key ?? '';
          chLogObject.trace_id.value = chLogObject.trace_id.value || o.trace_id;
          chLogObject.span_id.value = chLogObject.span_id.value || o.span_id;
          chLogObject.parent_span_id.value =
            chLogObject.parent_span_id.value || o.parent_span_id;
          chLogObject.span_name.value =
            chLogObject.span_name.value || o.span_name;
          store.metadata = o.metadata;
          store.providerKey = o.apiKey ?? null;
        }
      });
    }

    if (store.incomingBody.providerOptions) {
      chLogObject.virtual_key.value =
        store.incomingBody.providerOptions.virtualKey ?? '';
      chLogObject.trace_id.value =
        chLogObject.trace_id.value ||
        store.incomingBody.providerOptions.traceId;
      store.metadata = store.incomingBody.providerOptions.metadata;
      store.providerKey = store.incomingBody.providerOptions.apiKey ?? null;
    }

    if (
      !chLogObject.virtual_key.value &&
      store.portkeyHeaders[PORTKEY_HEADER_KEYS.VIRTUAL_KEY]
    ) {
      chLogObject.virtual_key.value =
        store.portkeyHeaders[PORTKEY_HEADER_KEYS.VIRTUAL_KEY];
    }

    try {
      if (
        store.portkeyHeaders[PORTKEY_HEADER_KEYS.CONFIG] &&
        !store.portkeyHeaders[PORTKEY_HEADER_KEYS.CONFIG].startsWith('pc-')
      ) {
        store.parsedConfigHeader = JSON.parse(
          store.portkeyHeaders[PORTKEY_HEADER_KEYS.CONFIG]
        );
      }
    } catch (err: any) {
      logger.error({
        message: `ERROR_PARSING_HEADER: ${err.message}`,
      });
    }

    store.providerKey =
      store.providerKey ?? store.requestURL
        ? findApiKey(
            store.requestBody,
            store.requestHeaders,
            store.proxyMode,
            store.lastUsedOptionIndex,
            store.requestURL
          )
        : '';

    // start: mask sensitive details from config (handling both old and new configs)
    try {
      if (store.parsedConfigHeader && store.parsedConfigHeader.options) {
        maskNestedConfig(store.parsedConfigHeader, 'options');
        store.portkeyHeaders[PORTKEY_HEADER_KEYS.CONFIG] = JSON.stringify(
          store.parsedConfigHeader
        );
      } else if (store.parsedConfigHeader) {
        maskNestedConfig(store.parsedConfigHeader, 'targets');
        store.portkeyHeaders[PORTKEY_HEADER_KEYS.CONFIG] = JSON.stringify(
          store.parsedConfigHeader
        );
      }
    } catch (err: any) {
      logger.error({
        message: `ERROR_MASKING_HEADERS: ${err.message}`,
      });
    }

    try {
      if (store.requestBody.config) {
        maskNestedConfig(store.requestBody.config, 'options');
        maskNestedConfig(store.requestBody.config, 'targets');
      }
    } catch (err: any) {
      logger.error({
        message: `ERROR_MASKING_CONFIG_FROM_BODY: ${err.message}`,
      });
    }
    // end: mask sensitive details from configs

    try {
      const defaultInputGuardrailsHeader = store.portkeyHeaders[
        'x-portkey-default-input-guardrails'
      ]
        ? JSON.parse(store.portkeyHeaders['x-portkey-default-input-guardrails'])
        : null;
      const defaultOutputGuardrailsHeader = store.portkeyHeaders[
        'x-portkey-default-output-guardrails'
      ]
        ? JSON.parse(
            store.portkeyHeaders['x-portkey-default-output-guardrails']
          )
        : null;

      if (defaultInputGuardrailsHeader) {
        maskHookSensitiveFields(defaultInputGuardrailsHeader);
        store.portkeyHeaders['x-portkey-default-input-guardrails'] =
          JSON.stringify(defaultInputGuardrailsHeader);
      }

      if (defaultOutputGuardrailsHeader) {
        maskHookSensitiveFields(defaultOutputGuardrailsHeader);
        store.portkeyHeaders['x-portkey-default-output-guardrails'] =
          JSON.stringify(defaultOutputGuardrailsHeader);
      }
    } catch (err: any) {
      logger.error({
        message: `ERROR_MASKING_DEFAULT_GUARDRAILS: ${err.message} \
         ${store.portkeyHeaders['x-portkey-default-input-guardrails']} \
         ${store.portkeyHeaders['x-portkey-default-output-guardrails']}`,
      });
    }

    chLogObject.mode.value =
      store.parsedConfigHeader?.strategy?.mode ??
      store.requestBody?.config?.strategy?.mode ??
      store.requestBody?.config?.mode ??
      'single';
    chLogObject.source.value = store.proxyMode;
    chLogObject.sdk_version.value =
      store.portkeyHeaders[PORTKEY_HEADER_KEYS.PACKAGE_VERSION] ?? '';
    chLogObject.runtime.value =
      store.portkeyHeaders[PORTKEY_HEADER_KEYS.RUNTIME] ?? '';
    chLogObject.runtime_version.value =
      store.portkeyHeaders[PORTKEY_HEADER_KEYS.RUNTIME_VERSION] ?? '';

    // Fallback requests can have same traceId coming from rubeus. Else create a new one.
    chLogObject.internal_trace_id.value =
      store.incomingBody.config.internalTraceId ?? internalTraceId;
    chLogObject.trace_id.value =
      chLogObject.trace_id.value || store.incomingBody.config.traceId;
    chLogObject.span_id.value =
      chLogObject.span_id.value || store.incomingBody.config.spanId;
    chLogObject.parent_span_id.value =
      chLogObject.parent_span_id.value ||
      store.incomingBody.config.parentSpanId;
    chLogObject.span_name.value =
      chLogObject.span_name.value || store.incomingBody.config.spanName;

    chLogObject.config.value =
      store.portkeyHeaders[PORTKEY_HEADER_KEYS.CONFIG_SLUG] ?? '';
    if (
      !chLogObject.config.value &&
      store.portkeyHeaders[PORTKEY_HEADER_KEYS.CONFIG]?.startsWith('pc-')
    ) {
      chLogObject.config.value =
        store.portkeyHeaders[PORTKEY_HEADER_KEYS.CONFIG];
    }
    chLogObject.config_version_id.value =
      store.portkeyHeaders[PORTKEY_HEADER_KEYS.CONFIG_VERSION] ?? '';

    store.responseHeaders = store.incomingBody.responseHeaders;
    store.responseBody = store.incomingBody.responseBody;
    store.responseStatusCode = store.incomingBody.responseStatus;
    store.upstreamResponseTime = store.incomingBody.upstreamResponseTime;
    store.responseTime = store.incomingBody.responseTime;

    store.organisationConfig = store.incomingBody.config.organisationConfig;

    store.debugLogSetting =
      store.incomingBody.debugLogSetting === false ? false : true;

    // checking for rubeus params
    if (
      store.incomingBody.config.requestParams &&
      !UNIFIED_FORM_DATA_ROUTES.includes(store.rubeusURL)
    ) {
      store.mappedRequestBody = store.incomingBody.config.requestParams;
    } else {
      store.mappedRequestBody = store.requestBody;
    }

    //FIND is_success
    chLogObject.is_success.value =
      store.responseStatusCode >= 200 && store.responseStatusCode < 300
        ? true
        : false;

    if (isServiceRequest) chLogObject.id.value = store.incomingBody.id;
    else chLogObject.id.value = crypto.randomUUID();
    logObject._id = chLogObject.id.value;

    chLogObject.organisation_id.value = store.organisationDetails.id;
    logObject.organisation_id = store.organisationDetails.id;
    chLogObject.organisation_name.value =
      store.organisationDetails.name || null;

    const created_at = store.incomingBody.createdAt || new Date();
    chLogObject.created_at.value = created_at
      .toISOString()
      .slice(0, 23)
      .replace('T', ' ');
    logObject.created_at = created_at.toString();

    const portyHeadersToBeLogged = {
      ...store.portkeyHeaders,
    };
    portkeyHeadersToBeRemoved.forEach((header) => {
      delete portyHeadersToBeLogged[header];
    });

    logObject.request =
      store.debugLogSetting !== false
        ? {
            url: store.requestURL ? sanitiseURL(store.requestURL) : '',
            method: store.requestMethod,
            headers: store.requestHeaders,
            body: store.requestBody,
            portkeyHeaders: portyHeadersToBeLogged,
          }
        : {
            url: store.requestURL ? sanitiseURL(store.requestURL) : '',
            method: store.requestMethod,
            portkeyHeaders: portyHeadersToBeLogged,
          };

    if (
      store.incomingBody.finalUntransformedRequest?.body &&
      store.debugLogSetting !== false
    ) {
      logObject.finalUntransformedRequest =
        store.incomingBody.finalUntransformedRequest;
    }
    if (
      store.incomingBody.originalResponse?.body &&
      (store.debugLogSetting !== false || !chLogObject.is_success.value)
    ) {
      logObject.originalResponse = store.incomingBody.originalResponse;
    }
    if (
      store.incomingBody.transformedRequest?.body &&
      store.debugLogSetting !== false
    ) {
      logObject.transformedRequest = store.incomingBody.transformedRequest;
    }

    chLogObject.request_url.value = store.requestURL
      ? sanitiseURL(store.requestURL)
      : '';
    chLogObject.request_method.value = store.requestMethod;

    logObject.response =
      store.debugLogSetting !== false || !chLogObject.is_success.value
        ? {
            status: store.responseStatusCode,
            headers: store.responseHeaders,
            body: store.responseBody,
            responseTime: store.responseTime,
            lastUsedOptionJsonPath: store.lastUsedOptionJsonPath ?? '',
          }
        : {
            status: store.responseStatusCode,
            responseTime: store.responseTime,
            lastUsedOptionJsonPath: store.lastUsedOptionJsonPath ?? '',
          };

    chLogObject.response_status_code.value = store.responseStatusCode;
    // For stream -> responseTime is equal to ttft
    // For non-stream -> responseTime is equal to ttft and overall execution time
    chLogObject.response_time.value = store.responseTime;
    chLogObject.upstream_response_time.value = store.upstreamResponseTime;
    //FIND is_proxy_call
    chLogObject.is_proxy_call.value = ['proxy', 'proxy-2'].includes(
      store.proxyMode
    )
      ? true
      : false;

    //fetch provider key to get azure model details
    let aiModel = '';
    try {
      aiModel = await providerLogConfig.modelConfig({
        apiKey: store.providerKey,
        env,
        reqBody: store.mappedRequestBody,
        resBody: store.responseBody,
        url: store.requestURL,
        providerOptions: store.incomingBody.providerOptions,
        isProxyCall: chLogObject.is_proxy_call.value,
        originalReqBody: store.incomingBody.finalUntransformedRequest?.body,
      });
      store.isFallbackModelName = aiModel.startsWith('fallback/');
      chLogObject.ai_model.value = aiModel.replace('fallback/', '');
    } catch (error: any) {
      logger.error({
        message: `ERROR_FETCHING_AI_MODEL: ${error.message}`,
      });
      // Fallback to direct model from request/response body or providerOptions
      const fallbackModel =
        store.mappedRequestBody?.model ||
        store.responseBody?.model ||
        store.incomingBody.providerOptions?.model;
      chLogObject.ai_model.value = fallbackModel || 'NA';
    }

    requestHeadersToBeMasked.forEach((header) => {
      if (store.requestHeaders[header]) {
        store.requestHeaders[header] = hash(store.requestHeaders[header]);
      }
      if (logObject.transformedRequest?.headers?.[header]) {
        logObject.transformedRequest.headers[header] = hash(
          logObject.transformedRequest.headers[header]
        );
      }
    });
    chLogObject.ai_org_auth_hash.value = hash(store.providerKey);

    //if ai model is in modelsToSkipSavingReponseBody or if it's an embed request, then remove the response body from the log
    if (
      (modelsToSkipSavingReponseBody[store.proxyProvider]?.includes(
        chLogObject.ai_model.value
      ) ||
        store.rubeusURL === 'embed') &&
      chLogObject.is_success.value
    ) {
      logObject.response.body = '...REDACTED...';
    }

    chLogObject.api_key_id.value = store.organisationDetails.apiKeyDetails.id;
  } catch (error: any) {
    logger.error({
      message: `ERROR_FETCHING_VALUES: ${error.message}`,
    });
    return {
      response: new Response(`Error in fetching values: ${error}`, {
        status: 400,
      }),
      analyticsLogObject: generateMetricObject(
        chLogObject
      ) as AnalyticsLogObjectV2,
    };
  }
  /**
   * VALIDATE REQUEST END.
   */

  chLogObject.request_parsing_time.value =
    store.incomingBody.requestParsingTime || 0;
  chLogObject.pre_processing_time.value =
    store.incomingBody.preProcessingTime || 0;
  chLogObject.cache_processing_time.value =
    store.incomingBody.cacheExecutionTime || 0;
  chLogObject.response_parsing_time.value =
    store.incomingBody.responseParsingTime || 0;
  chLogObject.gateway_version.value = store.incomingBody.gatewayVersion || '';
  chLogObject.ttlt.value = store.incomingBody.timeToLastToken || 0;
  chLogObject.gateway_processing_time.value =
    store.incomingBody.gatewayProcessingTime || 0;
  //FIND user_id, prompt_id, prompt_version_id
  // user_id is populated from the API key's associated user
  chLogObject.user_id.value =
    store.organisationDetails?.apiKeyDetails?.userId || null;
  chLogObject.prompt_id.value =
    store.incomingBody.providerOptions?.promptUuid ??
    store.portkeyHeaders[PORTKEY_HEADER_KEYS.PROMPT_ID] ??
    null;
  chLogObject.prompt_version_id.value =
    store.incomingBody.providerOptions?.promptVersionId ??
    store.portkeyHeaders[PORTKEY_HEADER_KEYS.PROMPT_VERSION_ID] ??
    null;
  chLogObject.prompt_slug.value =
    store.incomingBody.providerOptions?.promptId ??
    store.portkeyHeaders[PORTKEY_HEADER_KEYS.PROMPT_SLUG] ??
    '';

  //FIND config_id
  try {
    chLogObject.config_id.value = store.organisationConfig.id || null;
  } catch (error: any) {
    logger.error({
      message: `ERROR_FETCHING_CONFIG: ${error.message}`,
    });
  }

  //FIND ai_org
  chLogObject.ai_org.value = store.proxyProvider || null;
  const cacheUnits = {
    cacheWriteInputUnits: 0,
    cacheReadInputUnits: 0,
    cacheReadAudioInputUnits: 0,
  };
  if (chLogObject.is_success.value) {
    // Ignore units for data service requests or gen_ai traces if output is present
    if (store.incomingBody.output?.tokens) {
      chLogObject.req_units.value =
        store.incomingBody.output?.tokens?.requestUnits || 0;
      chLogObject.res_units.value =
        store.incomingBody.output?.tokens?.responseUnits || 0;
      cacheUnits.cacheReadInputUnits =
        store.incomingBody.output?.tokens?.cache?.cacheReadInputUnits || 0;
      cacheUnits.cacheWriteInputUnits =
        store.incomingBody.output?.tokens?.cache?.cacheWriteInputUnits || 0;
      cacheUnits.cacheReadAudioInputUnits =
        store.incomingBody.output?.tokens?.cache?.cacheReadAudioInputUnits || 0;

      store.tokens = {
        ...store.tokens,
        reqUnits: store.incomingBody.output?.tokens?.requestUnits || 0,
        resUnits: store.incomingBody.output?.tokens?.responseUnits || 0,
        cacheReadInputUnits:
          store.incomingBody.output?.tokens?.cache?.cacheReadInputUnits || 0,
        cacheWriteInputUnits:
          store.incomingBody.output?.tokens?.cache?.cacheWriteInputUnits || 0,
        cacheReadAudioInputUnits:
          store.incomingBody.output?.tokens?.cache?.cacheReadAudioInputUnits ||
          0,
      };
    } else {
      try {
        const tokens = await providerLogConfig.tokenConfig({
          env,
          model: chLogObject.ai_model.value,
          reqBody: store.mappedRequestBody,
          resBody: store.responseBody,
          originalResBody: store.incomingBody.originalResponse?.body,
          originalReqBody: store.incomingBody.finalUntransformedRequest?.body,
          url: store.requestURL,
          portkeyHeaders: store.portkeyHeaders,
          requestMethod: store.requestMethod,
        });
        const {
          reqUnits,
          resUnits,
          cacheReadInputUnits,
          cacheWriteInputUnits,
          cacheReadAudioInputUnits,
        } = tokens;
        chLogObject.req_units.value = reqUnits;
        chLogObject.res_units.value = resUnits;
        cacheUnits.cacheReadInputUnits = cacheReadInputUnits || 0;
        cacheUnits.cacheWriteInputUnits = cacheWriteInputUnits || 0;
        cacheUnits.cacheReadAudioInputUnits = cacheReadAudioInputUnits || 0;
        store.tokens = { ...store.tokens, ...tokens };
      } catch (error: any) {
        logger.error({
          message: `ERROR_FINDING_UNITS: ${error.message}`,
        });
        chLogObject.req_units.value = 0;
        chLogObject.res_units.value = 0;
      }
    }
  } else {
    chLogObject.req_units.value = 0;
    chLogObject.res_units.value = 0;
  }

  //FIND total_units
  chLogObject.total_units.value = null;
  try {
    chLogObject.total_units.value =
      parseInt(`${chLogObject.req_units.value}`) +
      parseInt(`${chLogObject.res_units.value}`);
  } catch (error: any) {
    logger.error({
      message: `ERROR_FETCHING_TOTAL_UNITS: ${error.message}`,
    });
  }

  if (store.incomingBody.output?.cost) {
    chLogObject.cost.value = store.incomingBody.output.cost.cost || 0;
    chLogObject.cost_currency.value =
      store.incomingBody.output.cost.currency || 'USD';
  } else {
    //FIND COST using the configs
    try {
      const priceConfig = !store.isFallbackModelName
        ? await getPricingConfig(
            chLogObject.ai_org.value as string,
            {
              model: chLogObject.ai_model.value,
              url: store.requestURL,
              reqUnits: chLogObject.req_units?.value || 0,
              resUnits: chLogObject.res_units?.value || 0,
              requestBody: store.requestBody,
              responseBody: store.responseBody,
              originalResponseBody: store.incomingBody.originalResponse?.body,
              incomingPricingConfig:
                store.incomingBody.providerOptions?.modelPricingConfig,
              providerOptions: store.incomingBody.providerOptions,
            },
            env
          )
        : null;
      if (priceConfig) {
        const cost = calculateCost(
          store.tokens,
          priceConfig,
          store.requestBody,
          chLogObject.is_success.value
        );
        const { requestCost, responseCost, currency } = cost;
        chLogObject.cost.value =
          Number(requestCost ?? 0) + Number(responseCost ?? 0);
        chLogObject.cost_currency.value = currency ?? 'USD';
      } else {
        chLogObject.cost.value = 0;
        chLogObject.cost_currency.value = 'USD';
      }
    } catch (error: any) {
      chLogObject.cost.value = 0;
      chLogObject.cost_currency.value = 'USD';
      logger.error({
        message: `ERROR_FETCHING_COST: ${error.message}`,
      });
    }
  }

  //Find cache_status
  chLogObject.cache_status.value =
    store.incomingBody.config.cacheStatus || null;

  // avoid double counting for custom batches
  if (store.incomingBody.output?.ignoreUsage) {
    logUsage = false;
  }

  //Find stream_mode
  chLogObject.stream_mode.value =
    store.incomingBody.config.streamingMode || null;

  if (
    logUsage &&
    chLogObject.cache_status.value !== 'HIT' &&
    chLogObject.cache_status.value !== 'SEMANTIC HIT' &&
    chLogObject.source.value === 'rubeus-2'
  ) {
    llmCostSum.inc(
      {
        provider: chLogObject.ai_org.value || 'N/A',
        model: chLogObject.ai_model.value,
        method: store.requestMethod || 'N/A',
        endpoint: store.rubeusURL,
        code: store.responseStatusCode?.toString() || 'N/A',
        ...getCustomLabels(store.portkeyHeaders[PORTKEY_HEADER_KEYS.METADATA]),
        stream: chLogObject.stream_mode.value ? 1 : 0,
        source: 'provider',
        cacheStatus: chLogObject.cache_status.value || 'N/A',
        payloadSizeRange: 'N/A',
      },
      chLogObject.cost.value || 0
    );
    llmTokenSum.inc(
      {
        provider: chLogObject.ai_org.value || 'N/A',
        model: chLogObject.ai_model.value,
        method: store.requestMethod || 'N/A',
        endpoint: store.rubeusURL,
        code: store.responseStatusCode?.toString() || 'N/A',
        ...getCustomLabels(store.portkeyHeaders[PORTKEY_HEADER_KEYS.METADATA]),
        stream: chLogObject.stream_mode.value ? 1 : 0,
        source: 'provider',
        cacheStatus: chLogObject.cache_status.value || 'N/A',
        payloadSizeRange: 'N/A',
      },
      chLogObject.total_units.value || 0
    );
  }

  //Find cache_type
  chLogObject.cache_type.value = store.incomingBody.config.cacheType || null;

  //Find retry_success_count
  chLogObject.retry_success_count.value =
    store.incomingBody.config.retryCount || 0;

  let metadataKeys: Array<string | null> = [];
  let metadataValues: Array<string | null> = [];
  let portkeyMetadata: Record<string, any> = {};

  //Find metadata, _environment, _user, _organisation, _prompt
  if (store.metadata) {
    portkeyMetadata = store.metadata;
  } else if (store.portkeyHeaders['x-portkey-metadata']) {
    try {
      portkeyMetadata = JSON.parse(store.portkeyHeaders['x-portkey-metadata']);
      store.metadata = portkeyMetadata;
    } catch {
      // Silently ignore JSON parsing errors
    }
  }

  try {
    chLogObject._user.value =
      sanitize(portkeyMetadata._user) ||
      sanitize(store.mappedRequestBody?.user) ||
      null;
    if (chLogObject._user.value) {
      portkeyMetadata._user = chLogObject._user.value;
    }

    if (portkeyMetadata) {
      // Store data in metadata.key and metadata.value
      metadataKeys = Object.keys(portkeyMetadata).map(sanitize);
      metadataValues = Object.values(portkeyMetadata).map(sanitize);
      chLogObject['metadata.key'].value = metadataKeys;
      chLogObject['metadata.value'].value = metadataValues;
    }
  } catch (error: any) {
    metadataKeys = [];
    metadataValues = [];
    logger.error({
      message: `ERROR_FETCHING_METADATA: ${error.message}`,
    });
  }

  //Find trace_id
  chLogObject.trace_id.value =
    chLogObject.trace_id.value || chLogObject.internal_trace_id.value;
  chLogObject.span_id.value = chLogObject.span_id.value || chLogObject.id.value;
  chLogObject.span_name.value =
    chLogObject.span_name.value || store.metadata?.span_name || 'llm';

  //Find extras
  chLogObject.extra_key.value = 'is_raw_logging_enabled';
  chLogObject.extra_value.value = store.debugLogSetting?.toString() || '';

  chLogObject.workspace_slug.value =
    store.organisationDetails?.workspaceDetails?.slug || null;

  const retentionPeriod =
    store.organisationDetails?.settings?.system_log_retention || 30;

  const { filePath, pathFormat } = getLogFilePath(
    env,
    retentionPeriod,
    store.organisationDetails.id,
    store.organisationDetails?.workspaceDetails?.slug,
    chLogObject.created_at.value,
    logObject._id as string,
    null,
    null
  );

  chLogObject.log_store_file_path_format.value = pathFormat;

  const mappedAnalyticsObject = generateMetricObject(chLogObject);
  logObject.metrics = mappedAnalyticsObject;

  const promises = [];

  const logOptions: LogOptions = {
    organisationId: store.organisationDetails.id,
    filePath: filePath,
    mongoCollectionName: Environment({}).MONGO_COLLECTION_NAME || '',
    bucket:
      store.organisationDetails.enterpriseSettings?.log_store_settings
        ?.log_store_generations_bucket,
    region:
      store.organisationDetails.enterpriseSettings?.log_store_settings
        ?.log_store_generations_region,
  };

  const logStoreApmOptions: LogStoreApmOptions = {
    type: 'generations',
    logId: logObject._id as string,
    organisationId: store.organisationDetails.id,
  };

  promises.push(
    uploadLogToLogStore(env, logObject, logOptions, logStoreApmOptions)
  );

  if (Environment(env).EXPERIMENTAL_GEN_AI_OTEL_PUSH_ENABLED === 'true') {
    promises.push(pushWinkyLogToOtelCollector(env, logObject));
  }

  promises.push(handlePostRequestUsage(env, store, chLogObject, logUsage));
  promises.push(handlePostRequestRateLimits(env, store, chLogObject, logUsage));

  // Send log object to Albus for first generation
  if (
    !store.organisationDetails.isFirstGenerationDone &&
    !store.isOnboardingRequest
  ) {
    promises.push(
      resyncOrganisationData({
        env,
        organisationId: store.organisationDetails.id,
        markFirstGenerationDone: true,
      })
    );
  }
  try {
    await Promise.all(promises);
  } catch (error: any) {
    logger.error({
      message: `ERROR_IN_POST_REQUEST_PROCESSING: ${error.message}`,
    });
  }
  return {
    analyticsLogObject: mappedAnalyticsObject as AnalyticsLogObjectV2,
    response: undefined,
  };
}

function customLogTransform(
  req: {
    headers: Headers;
    method: string;
    url: string;
  },
  body: Record<string, any>,
  env: Record<string, any>,
  internalTraceId: string
) {
  let organisationDetails;
  try {
    organisationDetails = JSON.parse(
      req.headers.get(PORTKEY_HEADER_KEYS.ORGANISATION_DETAILS) as string
    );
  } catch (error: any) {
    logger.error({
      message: `ERROR_PARSING_HEADER: ${error.message}`,
    });
  }
  const {
    request: bodyRequest,
    response: bodyResponse,
    metadata,
    output,
    createdAt,
  } = body;

  const request =
    typeof bodyRequest === 'object'
      ? bodyRequest
      : bodyRequest
        ? JSON.parse(bodyRequest)
        : {};
  const response =
    typeof bodyResponse === 'object'
      ? bodyResponse
      : bodyResponse
        ? JSON.parse(bodyResponse)
        : {};

  // Constructing the request part
  const transformedRequest = {
    method: request.method ? req.method.toUpperCase() : 'POST',
    headers: request.headers,
    requestBody: request.body ? request.body : request,
    requestURL: request.url,
    // Additional fields required by the original function
    // These fields may need to be filled with appropriate values
    requestHeaders: request.headers, // Assuming original function expects detailed headers here
  };

  // Constructing the response part
  const transformedResponse = {
    responseStatus: response.status || 200,
    responseHeaders: response.headers,
    responseBody: response.body ? response.body : response,
    responseTime: response.response_time,
    // Additional response-related fields if needed
  };

  let metadataFromHeaders = {};
  try {
    metadataFromHeaders = JSON.parse(
      req.headers.get(PORTKEY_HEADER_KEYS.METADATA) || '{}'
    );
  } catch (error: any) {
    logger.error({
      message: `ERROR_PARSING_METADATA_FROM_HEADERS: ${error.message}`,
    });
  }

  // Constructing the config and metadata part
  const providerOptions = {
    metadata: {
      ...(metadata || {}),
      ...metadataFromHeaders,
    },
  };

  //TODO: url mapping
  const provider = request.provider || req.headers.get(`x-portkey-provider`);
  const transformedConfig = {
    organisationConfig: {},
    organisationDetails: organisationDetails,
    cacheStatus: 'DISABLED',
    cacheType: null,
    retryCount: 0,
    // TODO: revisit this
    isStreamingMode: !!response.streamingMode,
    proxyMode: 'proxy-log',
    portkeyHeaders: {
      [PORTKEY_HEADER_KEYS.METADATA]: req.headers.get(
        PORTKEY_HEADER_KEYS.METADATA
      ),
      [PORTKEY_HEADER_KEYS.TRACE_ID]: req.headers.get(
        PORTKEY_HEADER_KEYS.TRACE_ID
      ),
      [PORTKEY_HEADER_KEYS.SPAN_ID]: req.headers.get(
        PORTKEY_HEADER_KEYS.SPAN_ID
      ),
      [PORTKEY_HEADER_KEYS.PARENT_SPAN_ID]: req.headers.get(
        PORTKEY_HEADER_KEYS.PARENT_SPAN_ID
      ),
      [PORTKEY_HEADER_KEYS.SPAN_NAME]: req.headers.get(
        PORTKEY_HEADER_KEYS.SPAN_NAME
      ),
      [PORTKEY_HEADER_KEYS.API_KEY]: req.headers.get(
        PORTKEY_HEADER_KEYS.API_KEY
      ),
      [PORTKEY_HEADER_KEYS.RUNTIME_VERSION]: req.headers.get(
        PORTKEY_HEADER_KEYS.RUNTIME_VERSION
      ),
      [PORTKEY_HEADER_KEYS.RUNTIME]: req.headers.get(
        PORTKEY_HEADER_KEYS.RUNTIME
      ),
      [PORTKEY_HEADER_KEYS.PACKAGE_VERSION]: req.headers.get(
        PORTKEY_HEADER_KEYS.PACKAGE_VERSION
      ),
      [PORTKEY_HEADER_KEYS.VIRTUAL_KEY]: req.headers.get(
        PORTKEY_HEADER_KEYS.VIRTUAL_KEY
      ),
    },
    provider: provider,
    requestParams: request.body,
    lastUsedOptionIndex: 0,
    internalTraceId: internalTraceId,
    traceId:
      body.trace_id ||
      providerOptions?.metadata.trace_id ||
      providerOptions?.metadata.traceId,
    spanId:
      body.span_id ||
      providerOptions?.metadata.span_id ||
      providerOptions?.metadata.spanId,
    parentSpanId:
      body.parent_span_id ||
      providerOptions?.metadata.parent_span_id ||
      providerOptions?.metadata.parentSpanId,
    spanName:
      body.span_name ||
      providerOptions?.metadata.span_name ||
      providerOptions?.metadata.spanName,
    cacheMaxAge: null,
  };

  //TODO: remove this in the next release
  const finalCreatedAt = createdAt || response.createdAt;

  // Assembling the final object expected by the original function
  const finalObject = {
    requestHeaders: transformedRequest.requestHeaders,
    config: transformedConfig,
    requestURL: transformedRequest.requestURL,
    requestMethod: transformedRequest.method,
    requestBody: transformedRequest.requestBody,
    responseHeaders: transformedResponse.responseHeaders,
    responseBody: transformedResponse.responseBody,
    responseStatus: transformedResponse.responseStatus,
    responseTime: transformedResponse.responseTime,
    providerOptions: providerOptions,
    output: output,
    ...(finalCreatedAt && { createdAt: new Date(finalCreatedAt) }),
  };

  console.log('finalObject', finalObject);
  return finalObject;
}

export async function uploadLogToAnalyticsStore(
  env: Record<string, any>,
  analyticsObjects: any[],
  analyticOptions: AnalyticsOptions
) {
  if (runtime === 'workerd' && env.clickhouseQ) {
    await env.clickhouseQ.send(
      {
        logObjects: analyticsObjects,
        tableName: analyticOptions.table,
        database: analyticOptions.database,
        server: analyticOptions.server,
        timestamp: Date.now(),
      },
      {
        contentType: 'json',
      }
    );
    return true;
  }
  // default to Clickhouse for backward compatibility
  const analyticsStore =
    Environment(env).ANALYTICS_STORE || ANALYTICS_STORES.CLICKHOUSE;
  if (analyticsStore === ANALYTICS_STORES.CONTROL_PLANE) {
    return logAnalyticsToControlPlane(env, analyticsObjects, analyticOptions);
  } else if (analyticsStore === ANALYTICS_STORES.CLICKHOUSE) {
    return logToClickhouse(env, analyticsObjects, analyticOptions.table);
  }
}

export async function uploadLogToLogStore(
  env: Record<string, any>,
  logObject: Record<string, any>,
  logOptions: LogOptions,
  logStoreApmOptions: LogStoreApmOptions
) {
  //default to Control Plane
  const logStore = Environment(env).LOG_STORE || LOG_STORES.CONTROL_PLANE;

  if (logStore === LOG_STORES.CONTROL_PLANE) {
    await uploadLogsToControlPlane(
      env,
      logObject,
      logOptions,
      logStoreApmOptions
    );
  } else if (logStore === LOG_STORES.MONGO) {
    await logToMongo(
      env,
      logObject,
      logOptions.mongoCollectionName as string,
      logStoreApmOptions
    );
  } else if (logStore === LOG_STORES.S3) {
    await uploadToS3(env, logObject, logOptions.filePath, logStoreApmOptions);
  } else if (logStore === LOG_STORES.S3_ASSUME) {
    await uploadToS3Assumed(
      env,
      logObject,
      logOptions.filePath,
      logStoreApmOptions
    );
  } else if (logStore === LOG_STORES.WASABI) {
    await uploadToWasabi(env, logObject, logOptions, logStoreApmOptions);
  } else if (logStore === LOG_STORES.GOOGLE_CLOUD_STORAGE) {
    await uploadToGcs(env, logObject, logOptions.filePath, logStoreApmOptions);
  } else if (logStore === LOG_STORES.GOOGLE_CLOUD_STORAGE_ASSUME) {
    await uploadToGcsAssumed(
      env,
      logObject,
      logOptions.filePath,
      logStoreApmOptions
    );
  } else if (logStore === LOG_STORES.AZURE_STORAGE) {
    await uploadToAzureStorage(
      env,
      logObject,
      logOptions.filePath,
      logStoreApmOptions
    );
  } else if (logStore === LOG_STORES.NETAPP) {
    await uploadToNetapp(
      env,
      logObject,
      logOptions.filePath,
      logStoreApmOptions
    );
  } else if (logStore === LOG_STORES.S3_CUSTOM) {
    await uploadToCustomS3(
      env,
      logObject,
      logOptions.filePath,
      logStoreApmOptions
    );
  }
}

export async function getLogFromLogStore(
  env: Record<string, any>,
  organisationDetails: Record<string, any>,
  logId: string,
  logOptions: LogOptions
) {
  //default to Wasabi
  const logStore = Environment(env).LOG_STORE || LOG_STORES.WASABI;
  if (logStore === LOG_STORES.MONGO) {
    return getFromMongo(env, logId, logOptions.mongoCollectionName as string);
  } else if (logStore === LOG_STORES.WASABI) {
    return getFromWasabi(env, logOptions.filePath);
  } else if (logStore === LOG_STORES.S3) {
    return getFromS3(env, logOptions.filePath);
  } else if (logStore === LOG_STORES.S3_ASSUME) {
    return getFromS3Assumed(env, logOptions.filePath);
  } else if (logStore === LOG_STORES.GOOGLE_CLOUD_STORAGE) {
    return getFromGcs(env, logOptions.filePath);
  } else if (logStore === LOG_STORES.GOOGLE_CLOUD_STORAGE_ASSUME) {
    return getFromGcsAssumed(env, logOptions.filePath);
  } else if (logStore === LOG_STORES.AZURE_STORAGE) {
    return getLogsFromAzureStorage(env, logOptions.filePath);
  } else if (logStore === LOG_STORES.NETAPP) {
    return getFromNetapp(env, logOptions.filePath);
  } else if (logStore === LOG_STORES.S3_CUSTOM) {
    return getFromCustomS3(env, logOptions.filePath);
  }
  throw new Error('Invalid Log Storage');
}

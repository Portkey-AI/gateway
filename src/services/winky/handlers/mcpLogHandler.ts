import { uploadLogToAnalyticsStore, uploadLogToLogStore } from '..';
import { logger } from '../../../apm';
import {
  AnalyticsOptions,
  LogOptions,
  LogStoreApmOptions,
} from '../../../middlewares/portkey/types';
import { generateMetricObject } from '../utils/helpers';
import { Environment } from '../../../utils/env';

type OtlpKeyValue = {
  key: string;
  value: {
    stringValue?: string;
    boolValue?: boolean;
    intValue?: string;
    doubleValue?: number;
    arrayValue?: any;
    kvlistValue?: any;
  };
};

type OTLPRecord = {
  timeUnixNano: string;
  attributes: OtlpKeyValue[] | undefined;
  traceId: string | undefined;
  spanId: string | undefined;
  status: { code: string };
  name: string;
};

// Helper function to extract value from OTEL attribute
function extractAttributeValue(
  attributes: OtlpKeyValue[] | undefined,
  key: string
): any {
  if (!attributes) return undefined;
  const attr = attributes.find((a) => a.key === key);
  if (!attr) return undefined;

  const { value } = attr;
  if (value.stringValue !== undefined) return value.stringValue;
  if (value.boolValue !== undefined) return value.boolValue;
  if (value.intValue !== undefined) return parseInt(value.intValue, 10);
  if (value.doubleValue !== undefined) return value.doubleValue;
  if (value.arrayValue !== undefined) return value.arrayValue;
  if (value.kvlistValue !== undefined) return value.kvlistValue;

  return undefined;
}

// Helper function to convert attributes to flat object
function attributesToObject(
  attributes: OtlpKeyValue[] | undefined
): Record<string, any> {
  if (!attributes) return {};
  const obj: Record<string, any> = {};
  for (const attr of attributes) {
    obj[attr.key] = extractAttributeValue([attr], attr.key);
  }
  return obj;
}

// Helper function to filter out heavy/redundant metadata fields
function isHeavyMetadataField(key: string): boolean {
  const fieldsToExclude = [
    // Heavy fields (already stored in log object)
    'mcp.tool.params', // Tool parameters (large nested objects)
    'mcp.tool.result', // Tool results (can be very large)
    'mcp.result', // General results (can be very large)

    // Redundant fields (already in dedicated columns)
    'mcp.workspace.id', // Already in workspace_slug column
    'mcp.transport.client', // Already in _environment column
    'mcp.transport.upstream', // Already in _environment column
    'mcp.request.id', // Not needed in metadata
    'organisation_id', // Already in organisation_id column
    'organisation_name', // Already in organisation_name column
    'workspace_slug', // Already in workspace_slug column
    'workspace_id', // Already extracted separately
    'workspace_name', // Already extracted separately
    'user_id', // Already in user_id column
    'api_key_id', // Already in api_key_id column
    'mcp.auth.type', // Already logged separately
    'mcp.request.duration_ms', // Already in response_time column
    'mcp.request.success', // Already in is_success column
  ];
  return fieldsToExclude.includes(key);
}

// Helper function to recursively unwrap OTEL value structures into clean JSON
function unwrapOtelValue(value: any): any {
  if (value === null || value === undefined) return value;

  // If it's a primitive, return as-is
  if (typeof value !== 'object') return value;

  // Handle OTEL value wrappers
  if ('stringValue' in value) return value.stringValue;
  if ('boolValue' in value) return value.boolValue;
  if ('intValue' in value) return parseInt(value.intValue, 10);
  if ('doubleValue' in value) return value.doubleValue;

  // Handle array wrapper
  if ('arrayValue' in value && value.arrayValue?.values) {
    return value.arrayValue.values.map(unwrapOtelValue);
  }

  // Handle key-value list wrapper
  if ('kvlistValue' in value && value.kvlistValue?.values) {
    const obj: Record<string, any> = {};
    for (const item of value.kvlistValue.values) {
      if (item.key && item.value) {
        obj[item.key] = unwrapOtelValue(item.value);
      }
    }
    return obj;
  }

  // Handle objects with 'values' array (top-level OTEL structure)
  if ('values' in value && Array.isArray(value.values)) {
    // Check if it's a key-value structure
    if (value.values[0]?.key && value.values[0]?.value) {
      const obj: Record<string, any> = {};
      for (const item of value.values) {
        if (item.key && item.value) {
          obj[item.key] = unwrapOtelValue(item.value);
        }
      }
      return obj;
    }
    // Otherwise, unwrap as array
    return value.values.map(unwrapOtelValue);
  }

  // Handle regular arrays
  if (Array.isArray(value)) {
    return value.map(unwrapOtelValue);
  }

  // Handle regular objects - recursively unwrap properties
  const obj: Record<string, any> = {};
  for (const [key, val] of Object.entries(value)) {
    obj[key] = unwrapOtelValue(val);
  }
  return obj;
}

export async function mcpLogHandler(
  env: Record<string, string>,
  requestBody: OTLPRecord | Record<string, any>
) {
  try {
    // Check if this is an OTEL record
    const isOtelRecord =
      'timeUnixNano' in requestBody && 'attributes' in requestBody;

    if (!isOtelRecord) {
      logger.warn({
        message: 'MCP_LOG_HANDLER_INVALID_FORMAT',
        error: 'Expected OTEL record format',
      });
      return new Response('Invalid log format', { status: 400 });
    }

    const otlpRecord = requestBody as OTLPRecord;
    const attributes = attributesToObject(otlpRecord.attributes);

    // Get unwrapped heavy fields (if available) to avoid re-unwrapping
    const unwrapped = (requestBody as any)._unwrapped || {};
    if (unwrapped) {
      Object.assign(attributes, unwrapped);
    }

    // Extract common fields from attributes
    const organisationId =
      attributes['organisation_id'] ||
      attributes['organization_id'] ||
      'unknown';
    const workspaceSlug = attributes['workspace_slug'] || 'default';
    const logId = crypto.randomUUID();

    // Convert Unix nano timestamp to date formats
    const timestampMs = parseInt(otlpRecord.timeUnixNano, 10) / 1_000_000;
    const createdAtDate = new Date(timestampMs);
    // ISO format for Clickhouse (matches LLM handler format)
    const createdAtForClickhouse = createdAtDate
      .toISOString()
      .slice(0, 23)
      .replace('T', ' ');
    // Native Date string format for log store (matches LLM handler format)
    const createdAtForLogStore = createdAtDate.toString();

    // Build Clickhouse log object matching generations table schema
    // Extract common MCP attributes
    const mcpServerId = attributes['mcp.server.id'] || '';
    const mcpWorkspaceId = attributes['mcp.workspace.id'] || '';
    const mcpMethod = attributes['mcp.request.method'] || '';
    const mcpToolName = attributes['mcp.tool.name'] || '';
    const mcpDurationMs = attributes['mcp.request.duration_ms'] || 0;
    const mcpRequestSuccess = attributes['mcp.request.success'];
    const clientTransport = attributes['mcp.transport.client'] || '';
    const upstreamTransport = attributes['mcp.transport.upstream'] || '';

    // Determine success: prioritize MCP-specific success flag, fall back to OTEL status
    const isSuccess =
      mcpRequestSuccess !== undefined
        ? mcpRequestSuccess === 'true' || mcpRequestSuccess === true
        : otlpRecord.status?.code === 'STATUS_CODE_OK';

    // Determine operation mode based on method
    const operationMode = mcpMethod.startsWith('tools/')
      ? 'mcp:tool_call'
      : mcpMethod.startsWith('resources/')
        ? 'mcp:resource_read'
        : mcpMethod.startsWith('prompts/')
          ? 'mcp:prompt_get'
          : mcpMethod === 'initialize'
            ? 'mcp:initialize'
            : 'mcp:' + mcpMethod.split('/')[0];

    // Construct MCP URL
    const mcpUrl = mcpToolName
      ? `mcp://${mcpServerId}/tools/${mcpToolName}`
      : `mcp://${mcpServerId}/${mcpMethod}`;

    const chLogObject = {
      // Required fields for generations table
      id: {
        type: 'string',
        value: logId,
        isNullable: false,
      },
      organisation_id: {
        type: 'string',
        value: organisationId,
        isNullable: false,
      },
      organisation_name: {
        type: 'string',
        value: attributes['organisation_name'] || null,
        isNullable: true,
      },
      user_id: {
        type: 'string',
        value: attributes['user_id'] || null,
        isNullable: true,
      },
      prompt_id: {
        type: 'string',
        value: null,
        isNullable: true,
      },
      prompt_version_id: {
        type: 'string',
        value: null,
        isNullable: true,
      },
      config_id: {
        type: 'string',
        value: mcpServerId || null,
        isNullable: true,
      },
      created_at: {
        type: 'string',
        value: createdAtForClickhouse,
        isNullable: false,
      },
      is_success: {
        type: 'int',
        value: isSuccess ? 1 : 0,
        isNullable: false,
      },
      ai_org: {
        type: 'string',
        value: 'mcp',
        isNullable: false,
      },
      ai_org_auth_hash: {
        type: 'string',
        value: null,
        isNullable: true,
      },
      ai_model: {
        type: 'string',
        value: mcpServerId || 'mcp',
        isNullable: false,
      },
      req_units: {
        type: 'int',
        value: 0,
        isNullable: false,
      },
      res_units: {
        type: 'int',
        value: 0,
        isNullable: false,
      },
      total_units: {
        type: 'int',
        value: 0,
        isNullable: false,
      },
      cost: {
        type: 'float',
        value: 0,
        isNullable: false,
      },
      cost_currency: {
        type: 'string',
        value: 'usd',
        isNullable: false,
      },
      request_url: {
        type: 'string',
        value: mcpUrl || null,
        isNullable: true,
      },
      request_method: {
        type: 'string',
        value: mcpMethod || 'POST',
        isNullable: false,
      },
      response_status_code: {
        type: 'int',
        value: isSuccess ? 200 : attributes['status_code'] || 500,
        isNullable: false,
      },
      response_time: {
        type: 'int',
        value: mcpDurationMs || 0,
        isNullable: false,
      },
      is_proxy_call: {
        type: 'int',
        value: 0,
        isNullable: false,
      },
      cache_status: {
        type: 'string',
        value: null,
        isNullable: true,
      },
      cache_type: {
        type: 'string',
        value: null,
        isNullable: true,
      },
      stream_mode: {
        type: 'int',
        value: 0,
        isNullable: false,
      },
      retry_success_count: {
        type: 'string',
        value: 0,
        isNullable: false,
      },
      _environment: {
        type: 'string',
        value:
          clientTransport || upstreamTransport
            ? `client:${clientTransport}|upstream:${upstreamTransport}`
            : null,
        isNullable: true,
      },
      _user: {
        type: 'string',
        value: attributes['user'] || null,
        isNullable: true,
      },
      _organisation: {
        type: 'string',
        value: organisationId || null,
        isNullable: true,
      },
      _prompt: {
        type: 'string',
        value: null,
        isNullable: true,
      },
      trace_id: {
        type: 'string',
        value: otlpRecord.traceId || logId,
        isNullable: false,
      },
      span_id: {
        type: 'string',
        value: otlpRecord.spanId || logId,
        isNullable: false,
      },
      span_name: {
        type: 'string',
        value: otlpRecord.name || 'mcp.request',
        isNullable: false,
      },
      parent_span_id: {
        type: 'string',
        value: attributes['parent_span_id'] || null,
        isNullable: true,
      },
      extra_key: {
        type: 'string',
        value: 'mcp_otel_status',
        isNullable: false,
      },
      extra_value: {
        type: 'string',
        value: otlpRecord.status?.code || 'STATUS_CODE_UNSET',
        isNullable: false,
      },
      mode: {
        type: 'string',
        value: operationMode,
        isNullable: false,
      },
      virtual_key: {
        type: 'string',
        value: mcpWorkspaceId
          ? `ws:${mcpWorkspaceId}:srv:${mcpServerId}`
          : null,
        isNullable: true,
      },
      source: {
        type: 'string',
        value: 'mcp',
        isNullable: false,
      },
      runtime: {
        type: 'string',
        value: attributes['runtime'] || null,
        isNullable: true,
      },
      runtime_version: {
        type: 'string',
        value: attributes['runtime_version'] || null,
        isNullable: true,
      },
      sdk_version: {
        type: 'string',
        value: attributes['sdk_version'] || null,
        isNullable: true,
      },
      config: {
        type: 'string',
        value: null,
        isNullable: true,
      },
      internal_trace_id: {
        type: 'string',
        value: otlpRecord.traceId || logId,
        isNullable: false,
      },
      last_used_option_index: {
        type: 'int',
        value: 0,
        isNullable: false,
      },
      config_version_id: {
        type: 'string',
        value: null,
        isNullable: true,
      },
      prompt_slug: {
        type: 'string',
        value: null,
        isNullable: true,
      },
      workspace_slug: {
        type: 'string',
        value: workspaceSlug,
        isNullable: false,
      },
      'metadata.key': {
        type: 'array',
        value: Object.keys(attributes).filter(
          (key) => !isHeavyMetadataField(key)
        ),
        isNullable: false,
      },
      'metadata.value': {
        type: 'array',
        value: Object.entries(attributes)
          .filter(([key]) => !isHeavyMetadataField(key))
          .map(([, v]) =>
            typeof v === 'object' ? JSON.stringify(v) : String(v)
          ),
        isNullable: false,
      },
      api_key_id: {
        type: 'string',
        value: attributes['api_key_id'] || null,
        isNullable: true,
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
      ttlt: {
        type: 'int',
        value: 0,
        isNullable: false,
      },
      gateway_version: {
        type: 'string',
        value: attributes['gateway_version'] || null,
        isNullable: true,
      },
    };

    // Build raw log object for detailed storage (matching standard generations format)
    // Heavy fields are already unwrapped (passed via _unwrapped), only unwrap if still wrapped
    const toolParams = attributes['mcp.tool.params']
      ? typeof attributes['mcp.tool.params'] === 'object' &&
        'values' in attributes['mcp.tool.params']
        ? unwrapOtelValue(attributes['mcp.tool.params'])
        : attributes['mcp.tool.params']
      : null;

    const rawToolResult =
      attributes['mcp.tool.result'] || attributes['mcp.result'];
    const toolResult = rawToolResult
      ? typeof rawToolResult === 'object' && 'values' in rawToolResult
        ? unwrapOtelValue(rawToolResult)
        : rawToolResult
      : null;

    const errorMessage = attributes['mcp.request.error'] || null;

    // Debug log to check if truncation happens here
    // if (toolResult) {
    // const resultSize = JSON.stringify(toolResult).length;
    // console.log(`[MCP] Tool result size: ${resultSize} bytes`);
    // if (resultSize > 100000) {
    //   console.warn(`[MCP] Large tool result detected: ${resultSize} bytes`);
    // }
    // }

    const logObject = {
      _id: logId,
      request: {
        url: mcpUrl || '',
        method: mcpMethod || 'POST',
        headers: {},
        body: {
          jsonrpc: '2.0',
          method: mcpMethod,
          params: toolParams || (mcpToolName ? { name: mcpToolName } : {}),
          id: attributes['mcp.request.id'] || '',
        },
        portkeyHeaders: {
          'mcp.server.id': mcpServerId,
          'mcp.workspace.id': mcpWorkspaceId,
          'mcp.transport.client': clientTransport,
          'mcp.transport.upstream': upstreamTransport,
        },
      },
      response: {
        status: isSuccess ? 200 : 500,
        headers: {},
        body: isSuccess
          ? {
              jsonrpc: '2.0',
              result: toolResult,
              id: attributes['mcp.request.id'] || '',
            }
          : {
              jsonrpc: '2.0',
              error: {
                code: -32603,
                message: errorMessage || 'Internal error',
              },
              id: attributes['mcp.request.id'] || '',
            },
      },
      organisation_id: organisationId,
      created_at: createdAtForLogStore,
      metrics: {} as any, // Will be set before upload
      // OTEL-specific fields
      otel: {
        trace_id: otlpRecord.traceId,
        span_id: otlpRecord.spanId,
        span_name: otlpRecord.name,
        timestamp_unix_nano: otlpRecord.timeUnixNano,
        status: otlpRecord.status,
        attributes: attributes,
        raw_record: otlpRecord,
      },
    };

    // Upload to analytics store (Clickhouse) - using generations table
    const analyticsOptions: AnalyticsOptions = {
      table: Environment(env).ANALYTICS_LOG_TABLE || 'generations',
    };

    const chInsertObject = generateMetricObject(chLogObject);

    // Add metrics to log object (following standard pattern)
    logObject.metrics = chInsertObject;

    // console.log("====> chInsertObject", chInsertObject);
    uploadLogToAnalyticsStore(env, [chInsertObject], analyticsOptions);

    // Upload to log store (MongoDB/S3/etc) for full log retention
    const retentionPeriod = attributes['retention_period'] || 30;
    const logOptions: LogOptions = {
      filePath: `${retentionPeriod}/${organisationId}/${logId}.json`,
      mongoCollectionName:
        Environment(env).MONGO_COLLECTION_NAME || 'generations',
      organisationId: organisationId,
    };

    const logStoreApmOptions: LogStoreApmOptions = {
      logId: logId,
      type: 'generations',
      organisationId: organisationId,
    };
    // console.log("====> logObject", logObject);
    await uploadLogToLogStore(env, logObject, logOptions, logStoreApmOptions);

    return new Response('ok', { status: 200 });
  } catch (err: any) {
    logger.error({
      message: 'MCP_LOG_HANDLER_ERROR',
      error: err.message,
      stack: err.stack,
    });
    return new Response('Internal server error', { status: 500 });
  }
}

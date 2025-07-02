import { getRuntimeKey } from 'hono/adapter';
import { post, postWithCloudflareServiceBinding } from '../utils';
import { PluginParameters } from '../types';

export const BASE_URL = 'https://api.portkey.ai/v1/execute-guardrails';

export const PORTKEY_ENDPOINTS = {
  MODERATIONS: '/moderations',
  LANGUAGE: '/language',
  PII: '/pii',
  GIBBERISH: '/gibberish',
};

interface PIIEntity {
  text: string;
  labels: Record<string, number>;
}

export interface PIIResponse {
  entities: PIIEntity[];
  processed_text: string;
}

export interface PIIResult {
  detectedPIICategories: string[];
  PIIData: PIIEntity[];
  redactedText: string;
}

export interface LogObjectRequest {
  url: string;
  method: string;
  headers: Record<string, any>;
  body: any;
  provider?: string;
}

export interface LogObjectResponse {
  status: number;
  headers: Record<string, any>;
  body: any;
  response_time: number;
  streamingMode: boolean;
}

export interface LogObjectMetadata extends Record<string, any> {
  traceId?: string;
  spanId?: string;
  parentSpanId?: string;
  spanName?: string;
}

export interface LogObject {
  request: LogObjectRequest;
  response: LogObjectResponse;
  metadata: LogObjectMetadata;
  createdAt: string;
}

interface PIIParameters extends PluginParameters {
  categories: string[];
  credentials: Record<string, any>;
  not?: boolean;
  redact?: boolean;
}

export const fetchPortkey = async (
  env: Record<string, any>,
  endpoint: string,
  credentials: any,
  data: any,
  timeout?: number
): Promise<{ response: PIIResponse[]; log: LogObject }> => {
  const options = {
    headers: {
      'x-portkey-api-key': credentials.apiKey,
    },
  };

  const url = `${BASE_URL}${endpoint}`;
  const startTime = Date.now();
  let responseData: any;
  let responseStatus: number = 200;
  let responseHeaders: Record<string, any> = {};
  let error: any = null;

  try {
    if (getRuntimeKey() === 'workerd' && env.portkeyGuardrails) {
      responseData = await postWithCloudflareServiceBinding(
        url,
        data,
        env.portkeyGuardrails,
        options,
        timeout
      );
    } else {
      responseData = await post(url, data, options, timeout);
    }
  } catch (e: any) {
    error = e;
    responseStatus = e.response?.status || 500;
    responseHeaders = {};
    responseData = e.response?.body || { error: e.message };
  }

  const endTime = Date.now();
  const responseTime = endTime - startTime;

  const log: LogObject = {
    request: {
      url,
      method: 'POST',
      headers: options.headers,
      body: data,
    },
    response: {
      status: responseStatus,
      headers: responseHeaders,
      body: responseData,
      response_time: responseTime,
      streamingMode: false,
    },
    metadata: {
      spanId: generateSpanId(),
      spanName: 'Portkey PII Check',
    },
    createdAt: new Date().toISOString(),
  };

  if (error) {
    throw { ...error, log };
  }

  return { response: responseData, log };
};

function generateSpanId(): string {
  return Math.random().toString(36).substring(2, 10);
}

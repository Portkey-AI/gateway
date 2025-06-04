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
) => {
  const options = {
    headers: {
      'x-portkey-api-key': credentials.apiKey,
    },
  };

  if (getRuntimeKey() === 'workerd' && env.portkeyGuardrails) {
    return postWithCloudflareServiceBinding(
      `${BASE_URL}${endpoint}`,
      data,
      env.portkeyGuardrails,
      options,
      timeout
    );
  }

  return post(`${BASE_URL}${endpoint}`, data, options, timeout);
};

import { getRuntimeKey } from 'hono/adapter';
import { post, postWithCloudflareServiceBinding } from '../utils';

export const BASE_URL = 'https://api.portkey.ai/v1/execute-guardrails';

export const PORTKEY_ENDPOINTS = {
  MODERATIONS: '/moderations',
  LANGUAGE: '/language',
  PII: '/pii',
  GIBBERISH: '/gibberish',
};

export const fetchPortkey = async (
  env: Record<string, any>,
  endpoint: string,
  credentials: any,
  data: any
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
      options
    );
  }

  return post(`${BASE_URL}${endpoint}`, data, options);
};

import { post } from "../utils";

export const PORTKEY_BASE_URL = 'https://api.portkey.ai/v1';
export const PORTKEY_ENDPOINTS = {
  MODERATIONS: '/moderations',
  LANGUAGE: '/tools/detect-language',
  PII: '/tools/detect-pii',
  GIBBERISH: '/tools/detect-gibberish',
};

export const fetchPortkey = async (endpoint: string, credentials: any, data:any) => {
  const options = {
    headers: {
      'x-portkey-api-key': `${credentials.apiKey}`,
      'x-portkey-provider': "openai",
      'x-portkey-virtual-key': `${credentials.virtualKey}`
    }
  }


  return post(`${PORTKEY_BASE_URL}${endpoint}`, data, options);
}

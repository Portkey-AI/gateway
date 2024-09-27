import { ACCEPT_TYPES, CONTENT_TYPES } from '../../globals';
import { ProviderAPIConfig } from '../types';
import { STABILITY_V2_MODELS } from './constants';

const StabilityAIAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://api.stability.ai',
  headers: ({ providerOptions }) => {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${providerOptions.apiKey}`,
    };
    if (providerOptions.transformToFormData) {
      headers['Content-Type'] = CONTENT_TYPES.MULTIPART_FORM_DATA;
      headers['Accept'] = ACCEPT_TYPES.APPLICATION_JSON;
    }
    return headers;
  },
  getEndpoint: ({ fn, gatewayRequestBody, providerOptions }) => {
    let mappedFn = fn;
    const { urlToFetch } = providerOptions;
    if (
      fn === 'proxy' &&
      urlToFetch &&
      urlToFetch?.indexOf('text-to-image') > -1
    ) {
      mappedFn = 'imageGenerate';
    }

    switch (mappedFn) {
      case 'imageGenerate': {
        if (
          gatewayRequestBody.model &&
          STABILITY_V2_MODELS.includes(gatewayRequestBody.model)
        ) {
          return `/v2beta/stable-image/generate/${gatewayRequestBody.model}`;
        }
        return `/v1/generation/${gatewayRequestBody.model}/text-to-image`;
      }
      default:
        return '';
    }
  },
};

export default StabilityAIAPIConfig;

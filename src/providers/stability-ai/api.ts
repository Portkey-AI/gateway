import { CONTENT_TYPES } from '../../globals';
import { ProviderAPIConfig } from '../types';
import { isStabilityV1Model } from './utils';

const StabilityAIAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://api.stability.ai',
  headers: ({ providerOptions, gatewayRequestBody }) => {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${providerOptions.apiKey}`,
    };
    if (isStabilityV1Model(gatewayRequestBody?.model)) return headers;
    headers['Content-Type'] = CONTENT_TYPES.MULTIPART_FORM_DATA;
    headers['Accept'] = CONTENT_TYPES.APPLICATION_JSON;
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
        if (isStabilityV1Model(gatewayRequestBody.model))
          return `/v1/generation/${gatewayRequestBody.model}/text-to-image`;
        return `/v2beta/stable-image/generate/${gatewayRequestBody.model}`;
      }
      default:
        return '';
    }
  },
  transformToFormData: ({ gatewayRequestBody }) => {
    if (isStabilityV1Model(gatewayRequestBody.model)) return false;
    return true;
  },
};

export default StabilityAIAPIConfig;

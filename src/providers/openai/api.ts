import { ProviderAPIConfig } from '../types';

const OpenAIAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://api.openai.com/v1',
  headers: ({ providerOptions }) => {
    const headersObj: Record<string, string> = {
      Authorization: `Bearer ${providerOptions.apiKey}`,
    };
    if (providerOptions.openaiOrganization) {
      headersObj['OpenAI-Organization'] = providerOptions.openaiOrganization;
    }

    if (providerOptions.openaiProject) {
      headersObj['OpenAI-Project'] = providerOptions.openaiProject;
    }

    return headersObj;
  },
  getEndpoint: ({ fn }) => {
    switch (fn) {
      case 'complete':
        return '/completions';
      case 'chatComplete':
        return '/chat/completions';
      case 'embed':
        return '/embeddings';
      case 'imageGenerate':
        return '/images/generations';
      default:
        return '';
    }
  },
};

export default OpenAIAPIConfig;

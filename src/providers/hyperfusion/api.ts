import { ProviderAPIConfig } from '../types';
import { HYPERFUSION } from '../../globals';

const HyperfusionAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://api.hyperfusion.io/v1',
  headers: ({ providerOptions }) => {
    if (!providerOptions.apiKey) {
      throw new Error(`${HYPERFUSION} provider requires an API key`);
    }
    
    const headersObj: Record<string, string> = {
      Authorization: `Bearer ${providerOptions.apiKey}`,
    };

    return headersObj;
  },
  getEndpoint: ({ fn, gatewayRequestURL }) => {
    // We can use basePath for custom routing if needed in the future
    // const basePath = gatewayRequestURL.split('/v1')?.[1];
    
    switch (fn) {
      case 'complete':
        return '/completions';
      case 'chatComplete':
        return '/chat/completions';
      case 'embed':
        return '/embeddings';
      case 'createSpeech':
        return '/audio/speech';
      case 'createTranscription':
        return '/audio/transcriptions';
      default:
        throw new Error(`Unsupported function: ${fn} for Hyperfusion provider`);
    }
  },
};

export default HyperfusionAPIConfig;
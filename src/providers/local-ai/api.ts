import { ProviderAPIConfig } from '../types';

const LoalAIAPIConfig: ProviderAPIConfig = {
  getBaseURL: ({providerOptions}) =>{
   return providerOptions.baseUrl || "https://something.com/v1";
  },
  headers: ({ providerOptions }) => {
    return { Authorization: `Bearer ${providerOptions.apiKey}` };
  },
 
  getEndpoint: ({ fn }) => {
    switch (fn) {
      case 'complete':
        return '/completions';
      case 'chatComplete':
        return '/chat/completions';
      case 'embed':
        return '/embeddings';
      
      default:
        return '';
    }
  },
};

export default LoalAIAPIConfig;

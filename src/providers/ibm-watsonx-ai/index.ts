import { ProviderConfigs } from '../types';
import { IBM_WATSONX_AI } from '../../globals';
import IBMWatsonXAIAPIConfig from './api';
import {
  IBMWatsonXAIChatCompleteConfig,
  IBMWatsonXAIChatCompleteResponseTransform,
  IBMWatsonXAIChatCompleteStreamChunkTransform,
} from './chatComplete';
import { chatCompleteResponseTransform } from '../openai-base/chatComplete'; // for type if needed

// Using a simplified base for params, then overriding with IBM specific.
// You might have a more generic base in your actual gateway.
const getBaseChatCompleteParams = () => ({
    messages: [], // required
    model: "",    // required
});


const IBMWatsonXAIConfig: ProviderConfigs = {
  chatComplete: {
    getConfig: (params: any) => ({ // params here are gateway's incoming request params + providerOptions
      ...getBaseChatCompleteParams(), // Ensure basic structure
      ...IBMWatsonXAIChatCompleteConfig, // Apply IBM specific config
      // Ensure required providerOptions are checked or passed through
      providerOptions: { 
        apiKey: params.providerOptions.apiKey,
        projectId: params.providerOptions.projectId,
        region: params.providerOptions.region,
        watsonxApiVersion: params.providerOptions.watsonxApiVersion,
       },
    }),
    api: IBMWatsonXAIAPIConfig,
    responseTransforms: {
      chatComplete: IBMWatsonXAIChatCompleteResponseTransform,
      chatCompleteStream: IBMWatsonXAIChatCompleteStreamChunkTransform,
    },
  },
  // complete and embed are not covered by this specific OpenAPI spec for /text/chat
  // If IBM has other endpoints for these, they would be defined similarly.
  complete: undefined, // Or throw error, or specific config if available
  embed: undefined,    // Or throw error, or specific config if available
  api: IBMWatsonXAIAPIConfig, // api config can be at root if shared, or per-mode
};

export default IBMWatsonXAIConfig;
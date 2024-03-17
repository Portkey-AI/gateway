import { ProviderAPIConfig } from "../types";

const TogetherAIApiConfig: ProviderAPIConfig = {
  getBaseURL: () => "https://api.together.xyz",
  headers: ({ providerOptions }) => {
    return {"Authorization": `Bearer ${providerOptions.apiKey}`}
  },
  getEndpoint: ({ fn }) => {
    switch (fn) {
      case 'complete': "/v1/completions";
      case 'chatComplete': "/v1/chat/completions";
      case 'embed': "/v1/embeddings";
      default: return '';
    }
  }
};

export default TogetherAIApiConfig;

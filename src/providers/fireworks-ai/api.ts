import { ProviderAPIConfig } from "../types";

const FireworksAIAPIConfig: ProviderAPIConfig = {
    getBaseURL: () => "https://api.fireworks.ai/inference/v1",
    headers: ({ providerOptions }) => {
        return { Authorization: `Bearer ${providerOptions.apiKey}` };
    },
    getEndpoint: ({ fn }) => {
        switch (fn) {
            case 'chatComplete': return "/chat/completions";
            case 'embed': return "/embeddings";
            default: return '';
        }
    }
};

export default FireworksAIAPIConfig;
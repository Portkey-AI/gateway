import { ProviderAPIConfig } from "../types";

const MistralAIAPIConfig: ProviderAPIConfig = {
    baseURL: "https://api.mistral.ai/v1",
    headers: (API_KEY: string) => {
        return { Authorization: `Bearer ${API_KEY}` };
    },
    chatComplete: "/chat/completions",
    embed: "/embeddings",
};

export default MistralAIAPIConfig;

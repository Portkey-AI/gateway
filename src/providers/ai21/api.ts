import { ProviderAPIConfig } from "../types";

const AI21APIConfig: ProviderAPIConfig = {
    baseURL: "https://api.ai21.com/studio/v1",
    headers: (API_KEY: string) => {
        const headers: Record<string, string> = {
            Authorization: `Bearer ${API_KEY}`,
        };
        return headers;
    },
    getEndpoint: (fn: string, model: string) => {
        switch (fn) {
            case "complete": {
                return `/${model}/complete`;
            }
            case "chatComplete": {
                return `/${model}/chat`;
            }
            case "embed": {
                return `/embed`;
            }
        }
    },
};

export default AI21APIConfig;

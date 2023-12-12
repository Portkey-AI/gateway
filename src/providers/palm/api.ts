import { ProviderAPIConfig } from "../types";

export const PalmApiConfig: ProviderAPIConfig = {
    baseURL: "https://generativelanguage.googleapis.com/v1beta3",
    headers: () => {
        return { "Content-Type": "application/json" }
    },
    getEndpoint: (fn: string, API_KEY: string, model: string) => {
        switch (fn) {
            case 'complete': {
                return `/models/${model}:generateText?key=${API_KEY}`
            }
            case 'chatComplete': {
                return `/models/${model}:generateMessage?key=${API_KEY}`
            }
            case 'embed': {
                return `/models/${model}:embedText?key=${API_KEY}`
            }
        }
    }
};

export default PalmApiConfig;

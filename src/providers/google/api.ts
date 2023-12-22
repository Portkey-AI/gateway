import { ProviderAPIConfig } from "../types";

export const GoogleApiConfig: ProviderAPIConfig = {
    baseURL: "https://generativelanguage.googleapis.com/v1beta",
    headers: () => {
        return { "Content-Type": "application/json" };
    },
    getEndpoint: (
        fn: string,
        API_KEY: string,
        model: string,
        stream: boolean
    ) => {
        let mappedFn = fn;
        if (stream) {
            mappedFn = `stream-${fn}`;
        }
        switch (mappedFn) {
            case "chatComplete": {
                return `/models/${model}:generateContent?key=${API_KEY}`;
            }
            case "stream-chatComplete": {
                return `/models/${model}:streamGenerateContent?key=${API_KEY}`;
            }
            case "embed": {
                return `/models/${model}:embedContent?key=${API_KEY}`;
            }
        }
    },
};

export default GoogleApiConfig;

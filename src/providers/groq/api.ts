import { ProviderAPIConfig } from "../types";

const GroqAPIConfig: ProviderAPIConfig = {
    baseURL: "https://api.groq.com/openai/v1",
    headers: (API_KEY: string) => {
        return { Authorization: `Bearer ${API_KEY}` };
    },
    chatComplete: "/chat/completions"
};

export default GroqAPIConfig;

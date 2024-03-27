// monsterapi/api.ts
import { ProviderAPIConfig } from "../types";

const MonsterAPIConfig: ProviderAPIConfig = {
    baseURL: "https://api.monsterapi.com/v1", // This should be replaced with the actual baseURL
    headers: (API_KEY: string) => {
        return { Authorization: `Bearer ${API_KEY}` };
    },
    chatComplete: "/chat/completions", // Update this if MonsterAPI has a chat completion endpoint
    // Add more endpoints as needed
};

export default MonsterAPIConfig;

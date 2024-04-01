import { ProviderAPIConfig } from "../types";

const MonsterAPIApiConfig: ProviderAPIConfig = {
    baseURL: "https://llm.monsterapi.ai/v1",
    headers: (API_KEY: string) => {
        return { "Authorization": `Bearer ${API_KEY}` };
    },
    generate: "/generate"
};

export default MonsterAPIApiConfig;

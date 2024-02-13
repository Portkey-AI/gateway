import { ProviderAPIConfig } from "../types";

const NomicAPIConfig: ProviderAPIConfig = {
    baseURL: "https://api-atlas.nomic.ai/v1",
    headers: (API_KEY: string) => {
        return { Authorization: `Bearer ${API_KEY}` };
    },
    embed: "/embedding/text",
};

export default NomicAPIConfig;

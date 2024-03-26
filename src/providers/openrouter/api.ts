import { ProviderAPIConfig } from "../types";

const OpenrouterAPIConfig: ProviderAPIConfig = {
  baseURL: "https://openrouter.ai/api/v1",
  headers: (API_KEY: string) => {
    return { Authorization: `Bearer ${API_KEY}` };
  },
  chatComplete: "/chat/completions",
};

export default OpenrouterAPIConfig;

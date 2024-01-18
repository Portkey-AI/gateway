import { ProviderAPIConfig } from "../types";

const DeepInfraApiConfig: ProviderAPIConfig = {
  baseURL: "https://api.deepinfra.com/v1/openai",
  headers: (API_KEY: string) => {
    return {
      Authorization: `Bearer ${API_KEY}`,
    };
  },
  chatComplete: "/chat/completions",
};

export default DeepInfraApiConfig;

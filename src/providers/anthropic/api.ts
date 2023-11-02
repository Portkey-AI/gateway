import { ProviderAPIConfig } from "../types";

const AnthropicAPIConfig: ProviderAPIConfig = {
  baseURL: "https://api.anthropic.com/v1",
  headers: (API_KEY:string) => {
    return {
      "X-API-Key": `${API_KEY}`,
      "anthropic-version": "2023-06-01"
    }
  },
  complete: "/complete",
  chatComplete: "/complete",
};

export default AnthropicAPIConfig;

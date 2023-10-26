import { ProviderAPIConfig } from "../types";

const AnthropicAPIConfig: ProviderAPIConfig = {
  baseURL: "https://api.anthropic.com/v1",
  headers: (API_KEY:string) => {
    return {"X-API-Key": `${API_KEY}`}
  },
  complete: "/complete",
  chatComplete: "/complete",
};

export default AnthropicAPIConfig;

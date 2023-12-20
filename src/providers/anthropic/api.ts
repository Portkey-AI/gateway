import { ProviderAPIConfig } from "../types";

const AnthropicAPIConfig: ProviderAPIConfig = {
  baseURL: "https://api.anthropic.com/v1",
  headers: (API_KEY:string, fn: string) => {
    const headers: Record<string, string> = {
      "X-API-Key": `${API_KEY}`,
      "anthropic-version": "2023-06-01"
    }
    if (fn === "chatComplete") {
      headers["anthropic-beta"] = "messages-2023-12-15";
    }
    return headers;
  },
  complete: "/complete",
  chatComplete: "/messages",
};

export default AnthropicAPIConfig;

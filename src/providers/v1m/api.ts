import { ProviderAPIConfig } from "../types";

export const v1mAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => "https://v1m.ir/v1",
  headers: ({ providerOptions }) => {
    return {
      Authorization: `Bearer ${providerOptions.apiKey || ""}`,
      "Content-Type": "application/json",
      "User-Agent": "Portkey-Gateway-v1m/1.0",
    };
  },
  getEndpoint: ({ fn }) => {
    switch (fn) {
      case "chatComplete":
        return "/systemone";
      default:
        return "/systemone";
    }
  },
};

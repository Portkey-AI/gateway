import { ProviderAPIConfig } from "../types";

const WorkersAiAPIConfig: ProviderAPIConfig = {
  getBaseURL: (ACCOUNT_ID:string) => `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai/run`,
  headers: (API_KEY:string) => {
    const headers: Record<string, string> = {
      "Authorization": `Bearer ${API_KEY}`,
    }
    return headers;
  },
  getEndpoint: (fn: string, model: string) => {
    switch (fn) {
      case "complete": {
        return `/${model}`;
      }
      case "chatComplete": {
        return `/${model}`;
      }
    }
  }
};

export default WorkersAiAPIConfig;

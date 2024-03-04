import { ProviderAPIConfig } from "../types";

const StabilityAIAPIConfig: ProviderAPIConfig = {
  baseURL: "https://api.segmind.com/v1",
  headers: (API_KEY:string) => {
    return {"x-api-key": `${API_KEY}`}
  },
  getEndpoint: (fn:string, ENGINE_ID:string, url?: string) => {
    return `/${ENGINE_ID}`
  }
};

export default StabilityAIAPIConfig;

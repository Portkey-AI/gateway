import { ProviderAPIConfig } from "../types";

const PerplexityAIApiConfig: ProviderAPIConfig = {
  baseURL: "https://api.perplexity.ai",
  headers: (API_KEY:string) => {
    return {"Authorization": `Bearer ${API_KEY}`}
  },
  chatComplete: "/chat/completions"
};

export default PerplexityAIApiConfig;

import { ProviderAPIConfig } from "../types";

const TogetherAIApiConfig: ProviderAPIConfig = {
  baseURL: "https://api.together.xyz",
  headers: (API_KEY:string) => {
    return {"Authorization": `Bearer ${API_KEY}`}
  },
  chatComplete: "/v1/chat/completions",
  complete: "/v1/completions"
};

export default TogetherAIApiConfig;

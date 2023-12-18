import { ProviderAPIConfig } from "../types";

const TogetherAIApiConfig: ProviderAPIConfig = {
  baseURL: "https://api.together.xyz/v1",
  headers: (API_KEY:string) => {
    return {"Authorization": `Bearer ${API_KEY}`}
  },
  chatComplete: "/chat/completions",
  complete: "/completions"
};

export default TogetherAIApiConfig;

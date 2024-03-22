import { ProviderAPIConfig } from "../types";

const MoonshotAPIConfig: ProviderAPIConfig = {
  baseURL: "https://api.moonshot.cn/v1",
  headers: (API_KEY: string) => {
    return { Authorization: `Bearer ${API_KEY}` };
  },
  chatComplete: "/chat/completions",
};

export default MoonshotAPIConfig;

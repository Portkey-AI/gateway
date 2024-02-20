import { ProviderAPIConfig } from "../types";

const ZhiPuAIAPIConfig: ProviderAPIConfig = {
  baseURL: "https://open.bigmodel.cn/api/paas/v4",
  headers: (API_KEY:string) => {
    return {"Authorization": `Bearer ${API_KEY}`}
  },
  chatComplete: "/chat/completions"
};

export default ZhiPuAIAPIConfig;

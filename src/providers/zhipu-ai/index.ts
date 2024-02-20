import { ProviderConfigs } from "../types";
import ZhiPuAIAPIConfig from "./api";
import { ZhiPuAIChatCompleteConfig } from "./chatComplete";

const ZhiPuAIConfig: ProviderConfigs = {
  api: ZhiPuAIAPIConfig,
  chatComplete: ZhiPuAIChatCompleteConfig
};

export default ZhiPuAIConfig;

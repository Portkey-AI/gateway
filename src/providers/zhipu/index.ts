import { ProviderConfigs } from "../types";
import ZhipuAPIConfig from "./api";
import {
  ZhipuChatCompleteConfig,
  ZhipuChatCompleteResponseTransform,
  ZhipuChatCompleteStreamChunkTransform,
} from "./chatComplete";

const ZhipuConfig: ProviderConfigs = {
  chatComplete: ZhipuChatCompleteConfig,
  api: ZhipuAPIConfig,
  responseTransforms: {
    chatComplete: ZhipuChatCompleteResponseTransform,
    "stream-chatComplete": ZhipuChatCompleteStreamChunkTransform,
  },
};

export default ZhipuConfig;

import { ProviderConfigs } from "../types";
import WorkersAiAPIConfig from "./api";
import { WorkersAiChatCompleteConfig, WorkersAiChatCompleteResponseTransform, WorkersAiChatCompleteStreamChunkTransform } from "./chatComplete";
import { WorkersAiCompleteConfig, WorkersAiCompleteResponseTransform, WorkersAiCompleteStreamChunkTransform } from "./complete";

const WorkersAiConfig: ProviderConfigs = {
  complete: WorkersAiCompleteConfig,
  chatComplete: WorkersAiChatCompleteConfig,
  api: WorkersAiAPIConfig,
  responseTransforms: {
    'stream-complete': WorkersAiCompleteStreamChunkTransform,
    complete: WorkersAiCompleteResponseTransform,
    'chatComplete': WorkersAiChatCompleteResponseTransform,
    'stream-chatComplete': WorkersAiChatCompleteStreamChunkTransform
  }
};

export default WorkersAiConfig;

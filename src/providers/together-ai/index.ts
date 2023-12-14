import { ProviderConfigs } from "../types";
import TogetherAIApiConfig from "./api";
import {TogetherAIChatCompleteConfig, TogetherAIChatCompleteResponseTransform, TogetherAIChatCompleteStreamChunkTransform } from "./chatComplete";
import { TogetherAICompleteConfig, TogetherAICompleteResponseTransform } from "./complete";

const TogetherAIConfig: ProviderConfigs = {
  complete: TogetherAICompleteConfig,
  chatComplete: TogetherAIChatCompleteConfig,
  api: TogetherAIApiConfig,
  responseTransforms: {
    'stream-complete': TogetherAIChatCompleteStreamChunkTransform,
    'complete': TogetherAICompleteResponseTransform,
    'chatComplete': TogetherAIChatCompleteResponseTransform,
    'stream-chatComplete': TogetherAIChatCompleteStreamChunkTransform
  }
};

export default TogetherAIConfig;

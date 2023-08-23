import { ProviderConfigs } from "../types";
import { OpenAICompleteConfig, OpenAICompleteResponseTransform } from "./complete";
import { OpenAIEmbedConfig, OpenAIEmbedResponseTransform } from "./embed";
import OpenAIAPIConfig from "./api";
import { OpenAIChatCompleteConfig, OpenAIChatCompleteResponseTransform } from "./chatComplete";

const OpenAIConfig: ProviderConfigs = {
  complete: OpenAICompleteConfig,
  embed: OpenAIEmbedConfig,
  api: OpenAIAPIConfig,
  chatComplete: OpenAIChatCompleteConfig,
  responseTransforms: {
    complete: OpenAICompleteResponseTransform,
    // 'stream-complete': OpenAICompleteResponseTransform,
    chatComplete: OpenAIChatCompleteResponseTransform,
    // 'stream-chatComplete': OpenAIChatCompleteResponseTransform,
    embed: OpenAIEmbedResponseTransform
  }
};

export default OpenAIConfig;

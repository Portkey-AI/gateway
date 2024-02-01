import { ProviderConfigs } from "../types";
import { OllamaCompleteConfig, OllamaCompleteResponseTransform, OllamaCompleteStreamChunkResponseTransform } from "./complete";
import { OllamaEmbedConfig, OllamaEmbedResponseTransform } from "./embed";
import OllamaAPIConfig from "./api";
import { OllamaChatCompleteConfig, OllamaChatCompleteResponseTransform } from "./chatComplete";

const OllamaConfig: ProviderConfigs = {
  
  complete: OllamaCompleteConfig,
  embed: OllamaEmbedConfig,
  api: OllamaAPIConfig,
  chatComplete: OllamaChatCompleteConfig,
  responseTransforms: {
    'stream-complete': OllamaCompleteStreamChunkResponseTransform,
    complete: OllamaCompleteResponseTransform,
    chatComplete: OllamaChatCompleteResponseTransform,
    embed: OllamaEmbedResponseTransform
  }
};

export default OllamaConfig;

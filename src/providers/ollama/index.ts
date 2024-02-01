import { ProviderConfigs } from "../types";
import { OllamaCompleteConfig, OllamaCompleteResponseTransform, OllamaCompleteStreamChunkResponseTransform } from "./complete";
import { OllamaEmbedConfig, OllamaEmbedResponseTransform } from "./embed";
import OllamaAPIConfig from "./api";
import { OllamaChatCompleteConfig, OllamaChatCompleteResponseTransform, OllamaChatCompleteStreamChunkTransform } from "./chatComplete";

const OllamaConfig: ProviderConfigs = {
  
  complete: OllamaCompleteConfig,
  embed: OllamaEmbedConfig,
  api: OllamaAPIConfig,
  chatComplete: OllamaChatCompleteConfig,
  responseTransforms: {
    complete: OllamaCompleteResponseTransform,
    'stream-complete': OllamaCompleteStreamChunkResponseTransform,
    chatComplete: OllamaChatCompleteResponseTransform,
    'stream-chatComplete': OllamaChatCompleteStreamChunkTransform,
    embed: OllamaEmbedResponseTransform
  }
};

export default OllamaConfig;

import { ProviderConfigs } from "../types";
import { AzureOpenAICompleteConfig, AzureOpenAICompleteResponseTransform } from "./complete";
import { AzureOpenAIEmbedConfig, AzureOpenAIEmbedResponseTransform } from "./embed";
import AzureOpenAIAPIConfig from "./api";
import { AzureOpenAIChatCompleteConfig, AzureOpenAIChatCompleteResponseTransform } from "./chatComplete";

const AzureOpenAIConfig: ProviderConfigs = {
  complete: AzureOpenAICompleteConfig,
  embed: AzureOpenAIEmbedConfig,
  api: AzureOpenAIAPIConfig,
  chatComplete: AzureOpenAIChatCompleteConfig,
  responseTransforms: {
    complete: AzureOpenAICompleteResponseTransform,
    chatComplete: AzureOpenAIChatCompleteResponseTransform,
    embed: AzureOpenAIEmbedResponseTransform
  }
};

export default AzureOpenAIConfig;

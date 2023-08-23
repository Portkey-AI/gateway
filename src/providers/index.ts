import AnthropicConfig from "./anthropic";
import AzureOpenAIConfig from "./azure-openai";
import CohereConfig from "./cohere";
import OpenAIConfig from "./openai";
import { ProviderConfigs } from "./types";

const Providers: { [key: string]: ProviderConfigs } = {
  openai: OpenAIConfig,
  cohere: CohereConfig,
  anthropic: AnthropicConfig,
  'azure-openai': AzureOpenAIConfig
};

export default Providers;

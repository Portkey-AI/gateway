import AnthropicConfig from "./anthropic";
import AnyscaleConfig from "./anyscale";
import AzureOpenAIConfig from "./azure-openai";
import CohereConfig from "./cohere";
import GoogleConfig from "./google";
import MistralAIConfig from "./mistral-ai";
import OpenAIConfig from "./openai";
import PalmAIConfig from "./palm";
import TogetherAIConfig from "./together-ai";
import { ProviderConfigs } from "./types";

const Providers: { [key: string]: ProviderConfigs } = {
  openai: OpenAIConfig,
  cohere: CohereConfig,
  anthropic: AnthropicConfig,
  'azure-openai': AzureOpenAIConfig,
  anyscale: AnyscaleConfig,
  palm: PalmAIConfig,
  'together-ai': TogetherAIConfig,
  google: GoogleConfig,
  'mistral-ai': MistralAIConfig
};

export default Providers;

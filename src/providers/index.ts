import AnthropicConfig from './anthropic';
import AnyscaleConfig from './anyscale';
import AzureOpenAIConfig from './azure-openai';
import CohereConfig from './cohere';
import OllamaConfig from './ollama';
import OpenAIConfig from './openai';
import { ProviderConfigs } from './types';

const Providers: { [key: string]: ProviderConfigs } = {
    openai: OpenAIConfig,
    cohere: CohereConfig,
    anthropic: AnthropicConfig,
    'azure-openai': AzureOpenAIConfig,
    anyscale: AnyscaleConfig,
    ollama: OllamaConfig,
};

export default Providers;


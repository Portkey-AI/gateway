import AI21Config from './ai21';
import AnthropicConfig from './anthropic';
import AnyscaleConfig from './anyscale';
import AzureOpenAIConfig from './azure-openai';
import BedrockConfig from './bedrock';
import CohereConfig from './cohere';
import DeepInfraConfig from './deepinfra';
import GoogleConfig from './google';
import VertexConfig from './google-vertex-ai';
import MistralAIConfig from './mistral-ai';
import NomicConfig from './nomic';
import OpenAIConfig from './openai';
import PalmAIConfig from './palm';
import PerplexityAIConfig from './perplexity-ai';
import TogetherAIConfig from './together-ai';
import StabilityAIConfig from './stability-ai';
import OllamaAPIConfig from './ollama';
import { ProviderConfigs } from './types';
import GroqConfig from './groq';
import SegmindConfig from './segmind';
import JinaConfig from './jina';
import FireworksAIConfig from './fireworks-ai';
import WorkersAiConfig from './workers-ai';
import MoonshotConfig from './moonshot';
import OpenrouterConfig from './openrouter';
import LingYiConfig from './lingyi';
import ZhipuConfig from './zhipu';
import AtomLLamaConfig from './atom-llama';

const Providers: { [key: string]: ProviderConfigs } = {
  openai: OpenAIConfig,
  cohere: CohereConfig,
  anthropic: AnthropicConfig,
  'azure-openai': AzureOpenAIConfig,
  anyscale: AnyscaleConfig,
  palm: PalmAIConfig,
  'together-ai': TogetherAIConfig,
  google: GoogleConfig,
  'vertex-ai': VertexConfig,
  'perplexity-ai': PerplexityAIConfig,
  'mistral-ai': MistralAIConfig,
  deepinfra: DeepInfraConfig,
  'stability-ai': StabilityAIConfig,
  nomic: NomicConfig,
  ollama: OllamaAPIConfig,
  ai21: AI21Config,
  bedrock: BedrockConfig,
  groq: GroqConfig,
  segmind: SegmindConfig,
  jina: JinaConfig,
  'fireworks-ai': FireworksAIConfig,
  'workers-ai': WorkersAiConfig,
  moonshot: MoonshotConfig,
  openrouter: OpenrouterConfig,
  lingyi: LingYiConfig,
  zhipu: ZhipuConfig,
  'atom-llama': AtomLLamaConfig,
};

export default Providers;

import BytezConfig from './bytez';
import AI21Config from './ai21';
import AnthropicConfig from './anthropic';
import AnyscaleConfig from './anyscale';
import AzureOpenAIConfig from './azure-openai';
import BedrockConfig from './bedrock';
import CohereConfig from './cohere';
import DeepInfraConfig from './deepinfra';
import NCompassConfig from './ncompass';
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
import RekaAIConfig from './reka-ai';
import MoonshotConfig from './moonshot';
import OpenrouterConfig from './openrouter';
import LingYiConfig from './lingyi';
import ZhipuConfig from './zhipu';
import NovitaAIConfig from './novita-ai';
import MonsterAPIConfig from './monsterapi';
import DeepSeekAPIConfig from './deepseek';
import PredibaseConfig from './predibase';
import TritonConfig from './triton/';
import VoyageConfig from './voyage';
import {
  AzureAIInferenceAPIConfig,
  GithubModelAPiConfig,
} from './azure-ai-inference';
import DeepbricksConfig from './deepbricks';
import SiliconFlowConfig from './siliconflow';
import HuggingfaceConfig from './huggingface';
import { cerebrasProviderAPIConfig } from './cerebras';
import { InferenceNetProviderConfigs } from './inference-net';
import SambaNovaConfig from './sambanova';
import LemonfoxAIConfig from './lemonfox-ai';
import { UpstageConfig } from './upstage';
import { LAMBDA } from '../globals';
import { LambdaProviderConfig } from './lambda';
import { DashScopeConfig } from './dashscope';
import XAIConfig from './x-ai';
import QdrantConfig from './qdrant';
import SagemakerConfig from './sagemaker';
import NebiusConfig from './nebius';
import RecraftAIConfig from './recraft-ai';
import MilvusConfig from './milvus';
import ReplicateConfig from './replicate';
import LeptonConfig from './lepton';
import KlusterAIConfig from './kluster-ai';
import NscaleConfig from './nscale';
import HyperbolicConfig from './hyperbolic';
import { FeatherlessAIConfig } from './featherless-ai';
import KrutrimConfig from './krutrim';
import AI302Config from './302ai';
import MeshyConfig from './meshy';
import Tripo3DConfig from './tripo3d';
import { NextBitConfig } from './nextbit';
import CometAPIConfig from './cometapi';
import ZAIConfig from './z-ai';
import MatterAIConfig from './matterai';
import ModalConfig from './modal';
import OracleConfig from './oracle';
import IOIntelligenceConfig from './iointelligence';
import AIBadgrConfig from './aibadgr';

const Providers: { [key: string]: ProviderConfigs } = {
  openai: OpenAIConfig,
  cohere: CohereConfig,
  anthropic: AnthropicConfig,
  'azure-openai': AzureOpenAIConfig,
  huggingface: HuggingfaceConfig,
  anyscale: AnyscaleConfig,
  palm: PalmAIConfig,
  'together-ai': TogetherAIConfig,
  google: GoogleConfig,
  'vertex-ai': VertexConfig,
  'perplexity-ai': PerplexityAIConfig,
  'mistral-ai': MistralAIConfig,
  deepinfra: DeepInfraConfig,
  ncompass: NCompassConfig,
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
  'reka-ai': RekaAIConfig,
  moonshot: MoonshotConfig,
  openrouter: OpenrouterConfig,
  lingyi: LingYiConfig,
  zhipu: ZhipuConfig,
  'novita-ai': NovitaAIConfig,
  monsterapi: MonsterAPIConfig,
  deepseek: DeepSeekAPIConfig,
  predibase: PredibaseConfig,
  triton: TritonConfig,
  voyage: VoyageConfig,
  'azure-ai': AzureAIInferenceAPIConfig,
  github: GithubModelAPiConfig,
  deepbricks: DeepbricksConfig,
  siliconflow: SiliconFlowConfig,
  cerebras: cerebrasProviderAPIConfig,
  'inference-net': InferenceNetProviderConfigs,
  sambanova: SambaNovaConfig,
  'lemonfox-ai': LemonfoxAIConfig,
  upstage: UpstageConfig,
  [LAMBDA]: LambdaProviderConfig,
  dashscope: DashScopeConfig,
  'x-ai': XAIConfig,
  qdrant: QdrantConfig,
  sagemaker: SagemakerConfig,
  nebius: NebiusConfig,
  'recraft-ai': RecraftAIConfig,
  milvus: MilvusConfig,
  replicate: ReplicateConfig,
  lepton: LeptonConfig,
  'kluster-ai': KlusterAIConfig,
  nscale: NscaleConfig,
  hyperbolic: HyperbolicConfig,
  bytez: BytezConfig,
  'featherless-ai': FeatherlessAIConfig,
  krutrim: KrutrimConfig,
  '302ai': AI302Config,
  cometapi: CometAPIConfig,
  matterai: MatterAIConfig,
  meshy: MeshyConfig,
  nextbit: NextBitConfig,
  tripo3d: Tripo3DConfig,
  modal: ModalConfig,
  'z-ai': ZAIConfig,
  oracle: OracleConfig,
  iointelligence: IOIntelligenceConfig,
  aibadgr: AIBadgrConfig,
};

export default Providers;

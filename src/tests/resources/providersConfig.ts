import Providers from '../../providers';

const providersConfig: Record<keyof typeof Providers, any> = {
  openai: {
    apiKey: '',
    chatCompletions: { model: 'gpt-3.5-turbo' },
  },
  cohere: {
    apiKey: '',
    chatCompletions: { model: 'command-r-plus' },
  },
  anthropic: {
    apiKey: '',
    chatCompletions: {
      model: 'claude-3-opus-20240229',
    },
  },
  'azure-openai': {
    apiKey: '',
    chatCompletions: { model: '' },
  },
  anyscale: {
    apiKey: '',
    chatCompletions: { model: 'j2-light' },
  },
  palm: {
    apiKey: '',
    chatCompletions: { model: '' },
  },
  'together-ai': {
    apiKey: '',
    chatCompletions: { model: 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo' },
  },
  google: {
    apiKey: '',
    chatCompletions: { model: 'gemini-1.5-flash' },
  },
  'vertex-ai': {
    apiKey: '',
    chatCompletions: { model: '' },
  },
  'perplexity-ai': {
    apiKey: '',
    chatCompletions: { model: 'llama-3-sonar-small-32k-online' },
  },
  'mistral-ai': {
    apiKey: '',
    chatCompletions: { model: 'open-mistral-nemo' },
  },
  deepinfra: {
    apiKey: '',
    chatCompletions: { model: 'meta-llama/Meta-Llama-3-8B-Instruct' },
  },
  'stability-ai': {
    apiKey: '',
    chatCompletions: { model: '' },
  },
  nomic: {
    apiKey: '',
    chatCompletions: { model: '' },
  },
  ollama: {
    apiKey: '',
    chatCompletions: { model: '' },
  },
  ai21: {
    apiKey: '',
    chatCompletions: {
      model: 'j2-ultra',
    },
  },
  bedrock: {
    apiKey: '',
    chatCompletions: { model: '' },
  },
  groq: {
    apiKey: '',
    chatCompletions: { model: 'llama3-8b-8192' },
  },
  segmind: {
    apiKey: '',
    chatCompletions: { model: '' },
  },
  jina: {
    apiKey: '',
    chatCompletions: { model: '' },
  },
  'fireworks-ai': {
    apiKey: '',
    chatCompletions: { model: '' },
  },
  'workers-ai': {
    apiKey: '',
    chatCompletions: { model: '' },
  },
  'reka-ai': {
    apiKey: '',
    chatCompletions: { model: '' },
  },
  moonshot: {
    apiKey: '',
    chatCompletions: { model: '' },
  },
  openrouter: {
    apiKey: '',
    chatCompletions: { model: 'meta-llama/llama-3.1-8b-instruct:free' },
  },
  lingyi: {
    apiKey: '',
    chatCompletions: { model: '' },
  },
  zhipu: {
    apiKey: '',
    chatCompletions: { model: '' },
  },
  'novita-ai': {
    apiKey: '',
    chatCompletions: { model: '' },
  },
  monsterapi: {
    apiKey: '',
    chatCompletions: { model: 'meta-llama/Meta-Llama-3-8B-Instruct' },
  },
  predibase: {
    apiKey: '',
    chatCompletions: { model: '' },
  },
};

export default providersConfig;

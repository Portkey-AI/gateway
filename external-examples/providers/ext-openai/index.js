/**
 * External OpenAI Provider
 *
 * A self-contained external provider that replicates OpenAI's API interface.
 * Used to demonstrate external provider loading in Portkey Gateway.
 */

export const metadata = {
  name: 'ext-openai',
  description: 'External OpenAI provider for testing',
  version: '1.0.0',
};

// API Configuration
const api = {
  getBaseURL: ({ providerOptions }) => {
    return providerOptions.baseURL || 'https://api.openai.com/v1';
  },

  headers: ({ providerOptions, fn }) => {
    const headersObj = {
      Authorization: `Bearer ${providerOptions.apiKey}`,
    };

    if (providerOptions.openaiOrganization) {
      headersObj['OpenAI-Organization'] = providerOptions.openaiOrganization;
    }

    if (providerOptions.openaiProject) {
      headersObj['OpenAI-Project'] = providerOptions.openaiProject;
    }

    if (
      fn === 'createTranscription' ||
      fn === 'createTranslation' ||
      fn === 'uploadFile' ||
      fn === 'imageEdit'
    ) {
      headersObj['Content-Type'] = 'multipart/form-data';
    }

    if (providerOptions.openaiBeta) {
      headersObj['OpenAI-Beta'] = providerOptions.openaiBeta;
    }

    return headersObj;
  },

  getEndpoint: ({ fn, gatewayRequestURL }) => {
    const basePath = gatewayRequestURL?.split('/v1')?.[1] || '';
    switch (fn) {
      case 'complete':
        return '/completions';
      case 'chatComplete':
        return '/chat/completions';
      case 'embed':
        return '/embeddings';
      case 'imageGenerate':
        return '/images/generations';
      case 'imageEdit':
        return '/images/edits';
      case 'createSpeech':
        return '/audio/speech';
      case 'createTranscription':
        return '/audio/transcriptions';
      case 'createTranslation':
        return '/audio/translations';
      default:
        return basePath || '';
    }
  },
};

// Chat Completion Config
const chatComplete = {
  model: { param: 'model', required: true, default: 'gpt-3.5-turbo' },
  messages: { param: 'messages', default: '' },
  functions: { param: 'functions' },
  function_call: { param: 'function_call' },
  max_tokens: { param: 'max_tokens', default: 100, min: 0 },
  max_completion_tokens: { param: 'max_completion_tokens' },
  temperature: { param: 'temperature', default: 1, min: 0, max: 2 },
  top_p: { param: 'top_p', default: 1, min: 0, max: 1 },
  n: { param: 'n', default: 1 },
  stream: { param: 'stream', default: false },
  stream_options: { param: 'stream_options' },
  stop: { param: 'stop' },
  presence_penalty: { param: 'presence_penalty', min: -2, max: 2 },
  frequency_penalty: { param: 'frequency_penalty', min: -2, max: 2 },
  logit_bias: { param: 'logit_bias' },
  logprobs: { param: 'logprobs', default: false },
  top_logprobs: { param: 'top_logprobs' },
  user: { param: 'user' },
  seed: { param: 'seed' },
  tools: { param: 'tools' },
  tool_choice: { param: 'tool_choice' },
  parallel_tool_calls: { param: 'parallel_tool_calls' },
  response_format: { param: 'response_format' },
  service_tier: { param: 'service_tier' },
  store: { param: 'store' },
  metadata: { param: 'metadata' },
  modalities: { param: 'modalities' },
  audio: { param: 'audio' },
  prediction: { param: 'prediction' },
  reasoning_effort: { param: 'reasoning_effort' },
};

// Completion Config
const complete = {
  model: { param: 'model', required: true, default: 'gpt-3.5-turbo-instruct' },
  prompt: { param: 'prompt', default: '' },
  max_tokens: { param: 'max_tokens', default: 100, min: 0 },
  temperature: { param: 'temperature', default: 1, min: 0, max: 2 },
  top_p: { param: 'top_p', default: 1, min: 0, max: 1 },
  n: { param: 'n', default: 1 },
  stream: { param: 'stream', default: false },
  logprobs: { param: 'logprobs' },
  echo: { param: 'echo' },
  stop: { param: 'stop' },
  presence_penalty: { param: 'presence_penalty', min: -2, max: 2 },
  frequency_penalty: { param: 'frequency_penalty', min: -2, max: 2 },
  best_of: { param: 'best_of' },
  logit_bias: { param: 'logit_bias' },
  user: { param: 'user' },
  seed: { param: 'seed' },
  suffix: { param: 'suffix' },
};

// Embed Config
const embed = {
  model: { param: 'model', required: true, default: 'text-embedding-ada-002' },
  input: { param: 'input', required: true },
  encoding_format: { param: 'encoding_format' },
  dimensions: { param: 'dimensions' },
  user: { param: 'user' },
};

// Image Generate Config
const imageGenerate = {
  model: { param: 'model', default: 'dall-e-2' },
  prompt: { param: 'prompt', required: true },
  n: { param: 'n', default: 1 },
  quality: { param: 'quality', default: 'standard' },
  response_format: { param: 'response_format', default: 'url' },
  size: { param: 'size', default: '1024x1024' },
  style: { param: 'style', default: 'vivid' },
  user: { param: 'user' },
};

// Create Speech Config
const createSpeech = {
  model: { param: 'model', required: true, default: 'tts-1' },
  input: { param: 'input', required: true },
  voice: { param: 'voice', required: true, default: 'alloy' },
  response_format: { param: 'response_format', default: 'mp3' },
  speed: { param: 'speed', default: 1, min: 0.25, max: 4 },
};

// Export the provider config
export default {
  api,
  chatComplete,
  complete,
  embed,
  imageGenerate,
  createSpeech,
  createTranscription: {},
  createTranslation: {},
};

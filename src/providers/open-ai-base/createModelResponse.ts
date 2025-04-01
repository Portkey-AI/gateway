import { ProviderConfig } from '../types';

export const OpenAICreateModelResponseConfig: ProviderConfig = {
  input: {
    param: 'input',
    required: true,
  },
  model: {
    param: 'model',
    required: true,
  },
  include: {
    param: 'include',
    required: false,
  },
  instructions: {
    param: 'instructions',
    required: false,
  },
  max_output_tokens: {
    param: 'max_output_tokens',
    required: false,
  },
  metadata: {
    param: 'metadata',
    required: false,
  },
  parallel_tool_calls: {
    param: 'modalities',
    required: false,
  },
  previous_response_id: {
    param: 'previous_response_id',
    required: false,
  },
  reasoning: {
    param: 'reasoning',
    required: false,
  },
  store: {
    param: 'store',
    required: false,
  },
  stream: {
    param: 'stream',
    required: false,
  },
  temperature: {
    param: 'temperature',
    required: false,
  },
  text: {
    param: 'text',
    required: false,
  },
  tool_choice: {
    param: 'tool_choice',
    required: false,
  },
  tools: {
    param: 'tools',
    required: false,
  },
  top_p: {
    param: 'top_p',
    required: false,
  },
  user: {
    param: 'user',
    required: false,
  },
};

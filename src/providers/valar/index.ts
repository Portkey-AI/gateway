import { VALAR } from '../../globals';
import {
  createModelResponseParams,
  OpenAICreateModelResponseTransformer,
  OpenAIGetModelResponseTransformer,
  responseTransformers,
} from '../open-ai-base';
import { ProviderConfigs } from '../types';
import ValarAPIConfig from './api';
import { ValarChatCompleteConfig } from './chatComplete';
import { ValarCreateBatchConfig } from './createBatch';
import {
  ValarMessagesConfig,
  ValarMessagesResponseTransform,
} from './messages';
import { ValarResponseTransform } from './utils';

// The Responses API is Valar's recommended surface, but it is deliberately a
// subset of OpenAI's: it answers with a single JSON object (long jobs use
// `background: true` plus a poll or a webhook instead of a stream), it keeps no
// server-side conversation state, and scheduling is governed by the completion
// window rather than `service_tier`.
const UNSUPPORTED_MODEL_RESPONSE_PARAMS = [
  'stream',
  'stream_options',
  'instructions',
  'previous_response_id',
  'conversation',
  'prompt',
  'parallel_tool_calls',
  'service_tier',
  'truncation',
  'safety_identifier',
  'verbosity',
  'modalities',
  'top_logprobs',
  'max_tool_calls',
  // Responses are always stored; `store: false` is rejected.
  'store',
];

const ValarConfig: ProviderConfigs = {
  api: ValarAPIConfig,
  chatComplete: ValarChatCompleteConfig,
  createModelResponse: createModelResponseParams(
    UNSUPPORTED_MODEL_RESPONSE_PARAMS
  ),
  getModelResponse: {},
  // Valar serves the Anthropic Messages format at `/v1/messages`, so the
  // Anthropic SDK and the Claude Agent SDK reach it through this provider too.
  messages: ValarMessagesConfig,
  messagesCountTokens: ValarMessagesConfig,
  uploadFile: {},
  listFiles: {},
  retrieveFile: {},
  deleteFile: {},
  retrieveFileContent: {},
  createBatch: ValarCreateBatchConfig,
  retrieveBatch: {},
  listBatches: {},
  responseTransforms: {
    ...responseTransformers(VALAR, {
      chatComplete: true,
    }),
    createModelResponse: OpenAICreateModelResponseTransformer(VALAR),
    getModelResponse: OpenAIGetModelResponseTransformer(VALAR),
    messages: ValarMessagesResponseTransform,
    uploadFile: ValarResponseTransform,
    listFiles: ValarResponseTransform,
    retrieveFile: ValarResponseTransform,
    deleteFile: ValarResponseTransform,
    retrieveFileContent: ValarResponseTransform,
    createBatch: ValarResponseTransform,
    retrieveBatch: ValarResponseTransform,
    listBatches: ValarResponseTransform,
  },
};

export default ValarConfig;

import { BYTEZ } from '../../globals';
import { ProviderConfig } from '../types';
import { BytezResponse } from './types';
import { generateErrorResponse } from '../utils';

const BytezInferenceChatCompleteConfig: ProviderConfig = {
  messages: {
    param: 'messages',
    required: true,
  },
  max_tokens: {
    param: 'params.max_new_tokens',
    default: 100,
    min: 0,
  },
  temperature: {
    param: 'params.temperature',
    default: 1,
    min: 0,
    max: 2,
  },
  top_p: {
    param: 'params.top_p',
    default: 1,
    min: 0,
    max: 1,
  },
  stream: {
    param: 'stream',
    default: false,
  },
};

function chatComplete(
  response: BytezResponse,
  responseStatus: number,
  responseHeaders: any,
  strictOpenAiCompliance: boolean,
  endpoint: string,
  requestBody: any
) {
  const { error, output } = response;

  if (error) {
    return generateErrorResponse(
      {
        message: error,
        type: String(responseStatus),
        param: null,
        code: null,
      },
      BYTEZ
    );
  }

  return {
    id: crypto.randomUUID(),
    object: 'chat.completion',
    created: Date.now(),
    model: requestBody.model,
    choices: [
      {
        index: 0,
        message: output,
        logprobs: null,
        finish_reason: 'stop',
      },
    ],
    usage: {
      completion_tokens: -1,
      prompt_tokens: -1,
      total_tokens: -1,
    },
  };
}

export { BytezInferenceChatCompleteConfig, chatComplete };

import { GROQ } from '../../globals';
import { chatCompleteParams, responseTransformers } from '../open-ai-base';
import { OpenAIChatCompleteResponse } from '../openai/chatComplete';
import { ErrorResponse, ProviderConfigs } from '../types';
import GroqAPIConfig from './api';
import { GroqChatCompleteStreamChunkTransform } from './chatComplete';

type GroqChatCompleteResponse = (OpenAIChatCompleteResponse | ErrorResponse) & {
  x_groq?: {
    id: string;
  };
};

const GroqConfig: ProviderConfigs = {
  chatComplete: chatCompleteParams(
    [
      'functions',
      'function_call',
      'presence_penalty',
      'frequency_penalty',
      'logit_bias',
      'user',
      'seed',
      'tools',
      'tool_choice',
      'response_format',
      'logprobs',
      'stream_options',
    ],
    { model: 'mixtral-8x7b-32768' }
  ),
  api: GroqAPIConfig,
  responseTransforms: {
    // chatComplete: GroqChatCompleteResponseTransform,
    ...responseTransformers<any, any, GroqChatCompleteResponse>(GROQ, {
      chatComplete: (response, isError) => {
        if (isError) {
          return response;
        }
        const newResponse = { ...response } as OpenAIChatCompleteResponse;

        delete (newResponse as any)['x_groq'];

        newResponse.usage = {
          completion_tokens: newResponse.usage?.completion_tokens || 0,
          prompt_tokens: newResponse.usage?.prompt_tokens || 0,
          total_tokens: newResponse.usage?.total_tokens || 0,
        };

        return newResponse;
      },
    }),
    'stream-chatComplete': GroqChatCompleteStreamChunkTransform,
  },
};

export default GroqConfig;

import { BYTEZ } from '../../globals';
import { ProviderConfigs } from '../types';
import { generateErrorResponse } from '../utils';
import BytezInferenceAPI from './api';
import { BytezInferenceChatCompleteConfig } from './chatComplete';
import { BytezResponse } from './types';

const BytezInferenceAPIConfig: ProviderConfigs = {
  api: BytezInferenceAPI,
  chatComplete: BytezInferenceChatCompleteConfig,
  responseTransforms: {
    chatComplete: (
      response: BytezResponse,
      responseStatus: number,
      responseHeaders: any,
      strictOpenAiCompliance: boolean,
      endpoint: string,
      requestBody: any
    ) => {
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
          inferenceTime: responseHeaders.get('inference-time'),
          modelSize: responseHeaders.get('inference-meter'),
        },
      };
    },
  },
};

export default BytezInferenceAPIConfig;

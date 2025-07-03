import { ProviderConfigs } from '../types';
import BytezInferenceAPI from './api';
import { BytezInferenceChatCompleteConfig } from './chatComplete';
import { bodyAdapter, LRUCache } from './utils';
import { BytezResponse } from './types';

const BASE_URL = 'https://api.bytez.com/models/v2';

const IS_CHAT_MODEL_CACHE = new LRUCache({ size: 100 });

const BytezInferenceAPIConfig: ProviderConfigs = {
  api: BytezInferenceAPI,
  chatComplete: BytezInferenceChatCompleteConfig,
  requestHandlers: {
    chatComplete: async ({ providerOptions, requestBody }) => {
      try {
        const { model: modelId } = requestBody;

        const adaptedBody = bodyAdapter(requestBody);

        const headers = {
          'Content-Type': 'application/json',
          Authorization: `Key ${providerOptions.apiKey}`,
        };

        const isChatModel = await validateModelIsChat(modelId, headers);

        if (!isChatModel) {
          return constructFailureResponse(
            'Bytez only supports chat models on PortKey',
            { status: 400 }
          );
        }

        const url = `${BASE_URL}/${modelId}`;

        const response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(adaptedBody),
        });

        if (adaptedBody.stream) {
          return new Response(response.body, response);
        }

        const { error, output }: BytezResponse = await response.json();

        if (error) {
          return constructFailureResponse(error, response);
        }

        return new Response(
          JSON.stringify({
            id: crypto.randomUUID(),
            object: 'chat.completion',
            created: Date.now(),
            model: modelId,
            choices: [
              {
                index: 0,
                message: output,
                logprobs: null,
                finish_reason: 'stop',
              },
            ],
            usage: {
              inferenceTime: response.headers.get('inference-time'),
              modelSize: response.headers.get('inference-meter'),
            },
          }),
          response
        );
      } catch (error: any) {
        return constructFailureResponse(error.message);
      }
    },
  },
};

async function validateModelIsChat(
  modelId: string,
  headers: Record<string, any>
) {
  // return from cache if already validated
  if (IS_CHAT_MODEL_CACHE.has(modelId)) {
    return IS_CHAT_MODEL_CACHE.get(modelId);
  }

  const url = `${BASE_URL}/list/models?modelId=${modelId}`;

  const response = await fetch(url, {
    headers,
  });

  const {
    error,
    output: [model],
  }: BytezResponse = await response.json();

  if (error) {
    throw new Error(error);
  }

  const isChatModel = model.task === 'chat';

  IS_CHAT_MODEL_CACHE.set(modelId, isChatModel);

  return isChatModel;
}

function constructFailureResponse(message: string, response?: object) {
  return new Response(
    JSON.stringify({
      status: 'failure',
      message,
    }),
    {
      status: 500,
      headers: {
        'content-type': 'application/json',
      },
      // override defaults if desired
      ...response,
    }
  );
}

export default BytezInferenceAPIConfig;

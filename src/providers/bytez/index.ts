import crypto from 'node:crypto';
import { ParameterConfig, ProviderConfigs } from '../types';
import BytezInferenceAPI from './api';
import { BytezInferenceChatCompleteConfig } from './chatComplete';
import { LRUCache } from './utils';
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

function bodyAdapter(requestBody: Record<string, any>) {
  for (const [param, paramConfig] of Object.entries(
    BytezInferenceChatCompleteConfig
  )) {
    const hasParam = Boolean(requestBody[param]);

    // first assign defaults
    if (!hasParam) {
      const { default: defaultValue, required } =
        paramConfig as ParameterConfig;

      // if it's required, throw
      if (required) {
        throw new Error(`Param ${param} is required`);
      }

      // assign the default value
      if (defaultValue !== undefined && requestBody[param] === undefined) {
        requestBody[param] = defaultValue;
      }
    }
  }

  // now we remap everything that has an alias, i.e. "prop" on propConfig
  for (const [key, value] of Object.entries(requestBody)) {
    const paramObj = BytezInferenceChatCompleteConfig[key] as
      | ParameterConfig
      | undefined;

    if (paramObj) {
      const { param } = paramObj;

      if (key !== param) {
        requestBody[param] = requestBody[key];
        delete requestBody[key];
      }
    }
  }

  // now we adapt to the bytez input signature
  // props to skip
  const skipProps: Record<string, boolean> = {
    model: true,
  };

  // props that cannot be removed from the body
  const reservedProps: Record<string, boolean> = {
    stream: true,
    messages: true,
  };
  const adaptedBody: Record<string, any> = { params: {} };

  for (const [key, value] of Object.entries(requestBody)) {
    // things like "model"
    if (skipProps[key]) {
      continue;
    }

    // things like "messages", "stream"
    if (reservedProps[key]) {
      adaptedBody[key] = value;
      continue;
    }
    // anything else, e.g. max_new_tokens
    adaptedBody.params[key] = value;
  }

  return adaptedBody;
}

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

export default BytezInferenceAPIConfig;

import crypto from 'node:crypto';
import { ParameterConfig, ProviderConfigs } from '../types';
import BytezInferenceAPI from './api';
import { BytezInferenceChatCompleteConfig } from './chatComplete';

const BASE_URL = 'https://api.bytez.com/models/v2';

class LRUCache<K, V> {
  private size: number;
  private map: Map<K, V>;

  constructor({ size = 100 } = {}) {
    this.size = size;
    this.map = new Map();
  }

  get(key: K): V | undefined {
    if (!this.map.has(key)) return undefined;

    // Move the key to the end to mark it as recently used
    const value = this.map.get(key)!;
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  set(key: K, value: V): void {
    if (this.map.has(key)) {
      // Remove the old value to update position
      this.map.delete(key);
    } else if (this.map.size >= this.size) {
      // Remove least recently used (first item in Map)
      const lruKey: any = this.map.keys().next().value;
      this.map.delete(lruKey);
    }

    // Insert the new key-value as most recently used
    this.map.set(key, value);
  }

  has(key: K): boolean {
    return this.map.has(key);
  }

  delete(key: K): boolean {
    return this.map.delete(key);
  }

  keys(): IterableIterator<K> {
    return this.map.keys();
  }

  values(): IterableIterator<V> {
    return this.map.values();
  }

  get length(): number {
    return this.map.size;
  }
}

const IS_CHAT_MODEL_CACHE = new LRUCache({ size: 100 });

const BytezInferenceAPIConfig: ProviderConfigs = {
  api: BytezInferenceAPI,
  chatComplete: BytezInferenceChatCompleteConfig,
  requestHandlers: {
    chatComplete: async ({ providerOptions, requestBody }) => {
      const { model: modelId } = requestBody;

      let adaptedBody;

      try {
        adaptedBody = bodyAdapter(requestBody);
      } catch (error: any) {
        return new Response(
          JSON.stringify({
            status: 'failure',
            message: error.message,
          }),
          {
            status: 500,
            headers: {
              'content-type': 'application/json',
            },
          }
        );
      }

      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Key ${providerOptions.apiKey}`,
      };

      const isChatModel = await validateModelIsChat(modelId, headers);

      if (!isChatModel) {
        return new Response(
          JSON.stringify({
            status: 'failure',
            message: 'Bytez only supports chat models on PortKey',
          }),
          {
            status: 500,
            headers: {
              'content-type': 'application/json',
            },
          }
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

      const { error, output }: { error: string | null; output: object | null } =
        await response.json();

      if (error) {
        return new Response(
          JSON.stringify({
            //
            message: error,
          }),
          response
        );
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
            // prompt_tokens: 11,
            // completion_tokens: 28,
            // total_tokens: 39,
            // prompt_tokens_details: {
            //   cached_tokens: 0,
            //   audio_tokens: 0,
            // },
            // completion_tokens_details: {
            //   reasoning_tokens: 0,
            //   audio_tokens: 0,
            //   accepted_prediction_tokens: 0,
            //   rejected_prediction_tokens: 0,
            // },
          },
          // service_tier: 'default',
          // system_fingerprint: 'fp_34a54ae93c',
        }),
        response
      );
    },
  },
};

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

interface Model {
  task: string;
}

interface BytezResponse {
  error: string;
  output: Model[];
  // add other model properties as needed
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

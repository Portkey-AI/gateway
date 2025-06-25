import crypto from 'node:crypto';
import { ProviderConfigs } from '../types';
import BytezInferenceAPI from './api';
import { BytezInferenceChatCompleteConfig } from './chatComplete';

const BASE_URL = 'https://api.bytez.com/models/v2';

const BytezInferenceAPIConfig: ProviderConfigs = {
  api: BytezInferenceAPI,
  chatComplete: BytezInferenceChatCompleteConfig,
  requestHandlers: {
    chatComplete: async ({ providerOptions, requestBody }) => {
      const skipProps: Record<string, boolean> = {
        model: true,
      };

      const reservedProps: Record<string, boolean> = {
        stream: true,
        messages: true,
        text: true,
      };

      const adaptedBody: Record<string, any> = {};
      const params: Record<string, any> = {};

      for (const [key, value] of Object.entries(requestBody)) {
        if (skipProps[key]) {
          continue;
        }

        if (reservedProps[key]) {
          adaptedBody[key] = value;
          continue;
        }

        params[key] = value;
      }

      adaptedBody.params = paramsAdapter(params);

      const url = `${BASE_URL}/${requestBody.model}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Key ${providerOptions.apiKey}`,
        },
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

function paramsAdapter(params: Record<string, any>) {
  const aliasMap: Record<string, any> = {
    max_tokens: 'max_new_tokens',
  };

  for (const key of Object.keys(params)) {
    const alias = aliasMap[key];

    if (alias) {
      params[alias] = params[key];
      delete params[key];
    }
  }

  return params;
}

export default BytezInferenceAPIConfig;

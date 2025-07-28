import { FIREWORKS_AI } from '../../globals';
import { Params } from '../../types/requestBody';
import { RequestHandler } from '../types';
import FireworksAIAPIConfig from './api';
import { fireworkFinetuneToOpenAIFinetune } from './utils';

export const FireworkCancelFinetuneResponseTransform = (
  response: any,
  status: number
) => {
  if (status !== 200) {
    const error = response?.error || 'Failed to cancel finetune';
    return new Response(JSON.stringify({ error: { message: error } }), {
      status: status || 500,
    });
  }

  return fireworkFinetuneToOpenAIFinetune(response);
};

export const FireworksCancelFinetuneRequestHandler: RequestHandler<
  Params
> = async ({ requestBody, requestURL, providerOptions, c }) => {
  const headers = await FireworksAIAPIConfig.headers({
    c,
    fn: 'cancelFinetune',
    providerOptions,
    transformedRequestUrl: requestURL,
    transformedRequestBody: requestBody,
  });

  const baseURL = await FireworksAIAPIConfig.getBaseURL({
    c,
    gatewayRequestURL: requestURL,
    providerOptions,
  });

  const endpoint = FireworksAIAPIConfig.getEndpoint({
    c,
    fn: 'cancelFinetune',
    gatewayRequestBodyJSON: requestBody,
    gatewayRequestURL: requestURL,
    providerOptions,
  });

  try {
    const request = await fetch(baseURL + endpoint, {
      method: 'DELETE',
      headers,
      body: JSON.stringify(requestBody),
    });

    if (!request.ok) {
      const error = await request.json();
      return new Response(
        JSON.stringify({
          error: { message: (error as any).error },
          provider: FIREWORKS_AI,
        }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    const response = await request.json();

    const mappedResponse = fireworkFinetuneToOpenAIFinetune(response as any);

    return new Response(JSON.stringify(mappedResponse), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: { message: errorMessage } }), {
      status: 500,
    });
  }
};

import { Context } from 'hono';
import { CONTENT_TYPES } from '../globals';
import Providers from '../providers';
import { OpenAIChatCompleteJSONToStreamResponseTransform } from '../providers/openai/chatComplete';
import { OpenAICompleteJSONToStreamResponseTransform } from '../providers/openai/complete';
import { Options, Params } from '../types/requestBody';

import {
  handleAudioResponse,
  handleImageResponse,
  handleJSONToStreamResponse,
  handleNonStreamingMode,
  handleOctetStreamResponse,
  handleStreamingMode,
  handleTextResponse,
} from './streamHandler';
import { HookSpan } from '../middlewares/hooks';
import { env } from 'hono/adapter';

/**
 * Handles various types of responses based on the specified parameters
 * and returns a mapped response
 * @param {Response} response - The HTTP response received from LLM.
 * @param {boolean} streamingMode - Indicates whether streaming mode is enabled.
 * @param {string} proxyProvider - The provider string.
 * @param {string | undefined} responseTransformer - The response transformer to determine type of call.
 * @param {string} requestURL - The URL of the original LLM request.
 * @param {boolean} [isCacheHit=false] - Indicates whether the response is a cache hit.
 * @param {Params} gatewayRequest - The gateway request parameters.  (Optional)
 * @param {any} beforeRequestHooksResult - The result of the before request hooks.  (Optional)
 * @param {Context} c - The context object. (Optional)
 * @param {endpointStrings} fn - The endpoint string. (Optional)
 * @returns {Promise<{response: Response, json?: any}>} - The mapped response.
 */
export async function responseHandler(
  response: Response,
  streamingMode: boolean,
  provider: string | Options,
  responseTransformer: string | undefined,
  requestURL: string,
  isCacheHit: boolean = false,
  gatewayRequest: Params,
  strictOpenAiCompliance: boolean,
  gatewayRequestUrl: string
): Promise<{
  response: Response;
  responseJson: Record<string, any> | null;
  originalResponseJson?: Record<string, any>;
}> {
  let responseTransformerFunction: Function | undefined;
  const responseContentType = response.headers?.get('content-type');
  const isSuccessStatusCode = [200, 246].includes(response.status);

  if (typeof provider == 'object') {
    provider = provider.provider || '';
  }

  const providerConfig = Providers[provider];
  let providerTransformers = Providers[provider]?.responseTransforms;

  if (providerConfig?.getConfig) {
    providerTransformers =
      providerConfig.getConfig(gatewayRequest).responseTransforms;
  }

  // Checking status 200 so that errors are not considered as stream mode.
  if (responseTransformer && streamingMode && isSuccessStatusCode) {
    responseTransformerFunction =
      providerTransformers?.[`stream-${responseTransformer}`];
  } else if (responseTransformer) {
    responseTransformerFunction = providerTransformers?.[responseTransformer];
  }

  // JSON to text/event-stream conversion is only allowed for unified routes: chat completions and completions.
  // Set the transformer to OpenAI json to stream convertor function in that case.
  if (responseTransformer && streamingMode && isCacheHit) {
    responseTransformerFunction =
      responseTransformer === 'chatComplete'
        ? OpenAIChatCompleteJSONToStreamResponseTransform
        : OpenAICompleteJSONToStreamResponseTransform;
  } else if (responseTransformer && !streamingMode && isCacheHit) {
    responseTransformerFunction = undefined;
  }

  if (
    streamingMode &&
    isSuccessStatusCode &&
    isCacheHit &&
    responseTransformerFunction
  ) {
    const streamingResponse = await handleJSONToStreamResponse(
      response,
      provider,
      responseTransformerFunction
    );
    return { response: streamingResponse, responseJson: null };
  }
  if (streamingMode && isSuccessStatusCode) {
    return {
      response: handleStreamingMode(
        response,
        provider,
        responseTransformerFunction,
        requestURL,
        strictOpenAiCompliance
      ),
      responseJson: null,
    };
  }

  if (responseContentType?.startsWith(CONTENT_TYPES.GENERIC_AUDIO_PATTERN)) {
    return { response: handleAudioResponse(response), responseJson: null };
  }

  if (
    responseContentType === CONTENT_TYPES.APPLICATION_OCTET_STREAM ||
    responseContentType === CONTENT_TYPES.BINARY_OCTET_STREAM
  ) {
    return {
      response: handleOctetStreamResponse(response),
      responseJson: null,
    };
  }

  if (responseContentType?.startsWith(CONTENT_TYPES.GENERIC_IMAGE_PATTERN)) {
    return { response: handleImageResponse(response), responseJson: null };
  }

  if (
    responseContentType?.startsWith(CONTENT_TYPES.PLAIN_TEXT) ||
    responseContentType?.startsWith(CONTENT_TYPES.HTML)
  ) {
    const textResponse = await handleTextResponse(
      response,
      responseTransformerFunction
    );
    return { response: textResponse, responseJson: null };
  }

  if (!responseContentType && response.status === 204) {
    return {
      response: new Response(response.body, response),
      responseJson: null,
    };
  }

  const nonStreamingResponse = await handleNonStreamingMode(
    response,
    responseTransformerFunction,
    strictOpenAiCompliance,
    gatewayRequestUrl
  );

  return {
    response: nonStreamingResponse.response,
    responseJson: nonStreamingResponse.json,
    originalResponseJson: nonStreamingResponse.originalResponseBodyJson,
  };
}

function createHookResponse(
  baseResponse: Response,
  responseData: any,
  hooksResult: any,
  options: {
    status?: number;
    statusText?: string;
    forceError?: boolean;
    headers?: Record<string, string>;
  } = {}
) {
  const responseBody = {
    ...(options.forceError
      ? {
          error: {
            message:
              'The guardrail checks defined in the config failed. You can find more information in the `hook_results` object.',
            type: 'hooks_failed',
            param: null,
            code: null,
          },
        }
      : responseData),
    ...((hooksResult.beforeRequestHooksResult?.length ||
      hooksResult.afterRequestHooksResult?.length) && {
      hook_results: {
        before_request_hooks: hooksResult.beforeRequestHooksResult,
        after_request_hooks: hooksResult.afterRequestHooksResult,
      },
    }),
  };

  return new Response(JSON.stringify(responseBody), {
    status: options.status || baseResponse.status,
    statusText: options.statusText || baseResponse.statusText,
    headers: options.headers || baseResponse.headers,
  });
}

export async function afterRequestHookHandler(
  c: Context,
  response: any,
  responseJSON: any,
  hookSpanId: string,
  retryAttemptsMade: number
): Promise<Response> {
  try {
    const hooksManager = c.get('hooksManager');

    hooksManager.setSpanContextResponse(
      hookSpanId,
      responseJSON,
      response.status
    );

    if (retryAttemptsMade > 0) {
      hooksManager.getSpan(hookSpanId).resetHookResult('afterRequestHook');
    }

    const { shouldDeny } = await hooksManager.executeHooks(
      hookSpanId,
      ['syncAfterRequestHook'],
      {
        env: env(c),
        getFromCacheByKey: c.get('getFromCacheByKey'),
        putInCacheWithValue: c.get('putInCacheWithValue'),
      }
    );

    const span = hooksManager.getSpan(hookSpanId) as HookSpan;
    const hooksResult = span.getHooksResult();

    const failedBeforeRequestHooks =
      hooksResult.beforeRequestHooksResult.filter((h) => !h.verdict);
    const failedAfterRequestHooks = hooksResult.afterRequestHooksResult.filter(
      (h) => !h.verdict
    );

    if (!responseJSON) {
      // For streaming responses, check if beforeRequestHooks failed without deny enabled.
      if (
        (failedBeforeRequestHooks.length || failedAfterRequestHooks.length) &&
        response.status === 200
      ) {
        // This should not be a major performance bottleneck as it is just copying the headers and using the body as is.
        return new Response(response.body, {
          ...response,
          status: 246,
          statusText: 'Hooks failed',
          headers: response.headers,
        });
      }
      return response;
    }

    if (shouldDeny) {
      return createHookResponse(response, {}, hooksResult, {
        status: 446,
        headers: { 'content-type': 'application/json' },
        forceError: true,
      });
    }

    const responseData = span.getContext().response.isTransformed
      ? span.getContext().response.json
      : responseJSON;

    if (
      (failedBeforeRequestHooks.length || failedAfterRequestHooks.length) &&
      response.status === 200
    ) {
      return createHookResponse(response, responseData, hooksResult, {
        status: 246,
        statusText: 'Hooks failed',
      });
    }

    return createHookResponse(response, responseData, hooksResult);
  } catch (err) {
    console.error(err);
    return response;
  }
}

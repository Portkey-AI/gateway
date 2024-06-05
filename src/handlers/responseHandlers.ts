import { Context } from "hono";
import { CONTENT_TYPES } from "../globals";
import Providers from "../providers";
import { OpenAIChatCompleteJSONToStreamResponseTransform } from "../providers/openai/chatComplete";
import { OpenAICompleteJSONToStreamResponseTransform } from "../providers/openai/complete";
import { Options, Params } from "../types/requestBody";

import {
  handleAudioResponse,
  handleImageResponse,
  handleJSONToStreamResponse,
  handleNonStreamingMode,
  handleOctetStreamResponse,
  handleStreamingMode,
  handleTextResponse,
} from './streamHandler';
import { endpointStrings } from "../providers/types";

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
export function responseHandler(
  response: Response,
  streamingMode: boolean,
  provider: string|Options,
  responseTransformer: string | undefined,
  requestURL: string,
  isCacheHit: boolean = false,
  gatewayRequest: Params,
  beforeRequestHooksResult: any = {},
  c: Context|undefined = undefined,
  fn: endpointStrings = "chatComplete"
): Promise<Response> {
  let responseTransformerFunction: Function | undefined;
  let providerOption:Options|undefined;
  const responseContentType = response.headers?.get('content-type');

  if (typeof provider == "object") {
    providerOption = { ...provider };
    provider = provider.provider || "";
  }

  const providerConfig = Providers[provider];
  let providerTransformers = Providers[provider]?.responseTransforms;

  if (providerConfig.getConfig) {
    providerTransformers =
      providerConfig.getConfig(gatewayRequest).responseTransforms;
  }

  // Checking status 200 so that errors are not considered as stream mode.
  if (responseTransformer && streamingMode && response.status === 200) {
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
    response.status === 200 &&
    isCacheHit &&
    responseTransformerFunction
  ) {
    return handleJSONToStreamResponse(
      response,
      provider,
      responseTransformerFunction
    );
  } 
  
  if (streamingMode && response.status === 200) {
    return handleStreamingMode(
      response,
      provider,
      responseTransformerFunction,
      requestURL
    );
  } 
  
  if (responseContentType?.startsWith(CONTENT_TYPES.GENERIC_AUDIO_PATTERN)) {
    return handleAudioResponse(response);
  } 
  
  if (responseContentType === CONTENT_TYPES.APPLICATION_OCTET_STREAM) {
    return handleOctetStreamResponse(response);
  } 
  
  if (responseContentType?.startsWith(CONTENT_TYPES.GENERIC_IMAGE_PATTERN)) {
    return handleImageResponse(response);
  } 
  
  if (
    responseContentType?.startsWith(CONTENT_TYPES.PLAIN_TEXT) ||
    responseContentType?.startsWith(CONTENT_TYPES.HTML)
  ) {
    return handleTextResponse(response, responseTransformerFunction);
  } 
  

  // console.log("this is a non-streaming mode response")
  return (async () => {
    let responseJSON:any;
    ({response, json:responseJSON} = await handleNonStreamingMode(response, responseTransformerFunction));
    
    let afterRequestHooksResult:any = responseJSON?.hook_results?.after_request_hooks;

    // Check and run afterRequestHooks
    if(
      typeof providerOption == "object" 
      && typeof c != "undefined" 
      && typeof responseJSON != "undefined"
      && response.status < 400
    ) {
      ({response, results: afterRequestHooksResult} = await afterRequestHookHandler(
        c, 
        providerOption, 
        response, 
        responseJSON, 
        fn, 
        streamingMode, 
        gatewayRequest
      ))
    };

    if (response.status < 400 && (beforeRequestHooksResult?.length || afterRequestHooksResult?.length)) {
      
      let afterHooksVerdict = afterRequestHooksResult?.every((h: any) => h.verdict) ?? true;
      let beforeHooksVerdict = beforeRequestHooksResult?.every((h: any) => h.verdict) ?? true;

      responseJSON.hook_results = {
        ...(afterRequestHooksResult?.length && {after_request_hooks: afterRequestHooksResult}),
        ...(beforeRequestHooksResult?.length && {before_request_hooks: beforeRequestHooksResult})
      }

      response = new Response(JSON.stringify(responseJSON), {
        status: (afterHooksVerdict && beforeHooksVerdict) ? response.status : 246,
        statusText: (afterHooksVerdict && beforeHooksVerdict) ? response.statusText : "Guardrails failed",
        headers: response.headers,
      })
    }

    return response;
  })();
}

export async function afterRequestHookHandler(
  c: Context, 
  providerOption: any, 
  response: any,
  responseJSON: any,
  fn: any, 
  isStreamingMode:boolean,
  gatewayParams: any
): Promise<{response: Response, results?: any}> {
  const { afterRequestHooks, provider } = providerOption;

  if (
    (isStreamingMode ||
    !response.headers.get('content-type')?.startsWith('application/json') ||
    !response.ok) ||
    !["chatComplete", "complete"].includes(fn)
  ) {
    return {response, results: []};
  }

  try {
    const hooksManager = c.get("hooksManager");

    hooksManager.setContext("afterRequestHook", provider, gatewayParams, responseJSON);
    let {results: afterRequestHooksResult, response: hooksResponse} = await hooksManager.executeHooksSync(afterRequestHooks);

    if (!!hooksResponse) {
      response = hooksResponse
    }

    return {response, results: afterRequestHooksResult};
  } catch (err) {
    console.error(err);
    return {response, results: []};
    // TODO: Handle this!!
  }
}
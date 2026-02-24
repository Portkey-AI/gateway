import { getDefaultModelName } from '../../utils/pricing';
import { LogConfig, ModelInput, TokenInput, Tokens } from '../types';

export const XAiLogConfig: LogConfig = {
  getBaseURL: getBaseURL,
  modelConfig: modelConfig,
  tokenConfig: tokenConfig,
};

function getBaseURL() {
  return 'https://api.x.ai/v1';
}

function modelConfig(input: ModelInput) {
  const { reqBody, resBody, url } = input;
  let model = getDefaultModelName(reqBody, resBody);

  // xAI realtime API uses a default model (no model query parameter)
  // The model name "grok-1118" is returned in session.updated response
  // See: https://docs.x.ai/docs/guides/voice/agent
  if (url.includes('/realtime') && !model) {
    model = 'grok-1118';
  }

  return model;
}

/**
 * Get token counts from realtime event responses
 * xAI realtime API uses OpenAI-compatible event format
 */
function getRealtimeEventTokens(input: TokenInput) {
  const { resBody } = input;
  const responseObj: Tokens = {
    reqUnits: 0,
    resUnits: 0,
    cacheReadInputUnits: 0,
    cacheWriteInputUnits: 0,
  };

  if (resBody.type !== 'response.done') {
    return responseObj;
  }

  const { usage } = resBody.response || {};

  if (!usage) return responseObj;

  const {
    input_tokens,
    output_tokens,
    input_token_details,
    output_token_details,
  } = usage;

  responseObj.reqUnits = input_tokens || 0;
  responseObj.resUnits = output_tokens || 0;
  responseObj.cacheReadInputUnits =
    input_token_details?.cached_tokens_details?.text_tokens || 0;
  responseObj.cacheReadAudioInputUnits =
    input_token_details?.cached_tokens_details?.audio_tokens || 0;
  responseObj.resAudioUnits = output_token_details?.audio_tokens;
  responseObj.resTextUnits = output_token_details?.text_tokens;
  responseObj.reqTextUnits = input_token_details?.text_tokens;
  responseObj.reqAudioUnits = input_token_details?.audio_tokens;

  return responseObj;
}

function tokenConfig(input: TokenInput) {
  const { resBody, url, requestMethod } = input;
  let apiType: string | null = null;

  // Determine API type from URL
  if (url.indexOf('/chat/completions') > -1 && requestMethod === 'POST') {
    apiType = 'chat';
  } else if (url.indexOf('/completions') > -1) {
    apiType = 'generate';
  } else if (url.indexOf('/realtime') > -1) {
    apiType = 'realtime';
  } else if (url.indexOf('/embeddings') > -1) {
    apiType = 'embed';
  }

  // Handle realtime events
  if (apiType === 'realtime') {
    return getRealtimeEventTokens(input);
  }

  const responseObj: Tokens = {
    reqUnits: 0,
    resUnits: 0,
  };

  if (!apiType) {
    return responseObj;
  }

  // Handle cache tokens if available
  responseObj.cacheReadInputUnits =
    resBody.usage?.prompt_tokens_details?.cached_tokens || 0;
  responseObj.cacheWriteInputUnits = 0;

  if (resBody.usage?.prompt_tokens) {
    responseObj.reqUnits = resBody.usage.prompt_tokens;
  }

  if (resBody.usage?.completion_tokens) {
    responseObj.resUnits = resBody.usage.completion_tokens;
  }

  return responseObj;
}

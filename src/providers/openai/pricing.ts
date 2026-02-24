import {
  getDefaultModelName,
  getFallbackModelName,
  openaiTokenize,
} from '../../utils/pricing';
import { LogConfig, ModelInput, TokenInput, Tokens } from '../types';
import { PORTKEY_HEADER_KEYS } from '../../middlewares/portkey/globals';
import { OPEN_AI } from '../../globals';

export const OpenAILogConfig: LogConfig = {
  getBaseURL: getBaseURL,
  modelConfig: modelConfig,
  tokenConfig: tokenConfig,
};

function getBaseURL() {
  return 'https://api.openai.com/v1';
}

function modelConfig(input: ModelInput) {
  const { reqBody, resBody, url } = input;
  if (url.includes('/images/edits')) {
    return reqBody?.model;
  }
  let model =
    getDefaultModelName(reqBody, resBody) || getFallbackModelName(OPEN_AI, url);

  if (url.includes('/realtime') && url.includes('model')) {
    const query = url.split('?')[1];
    model = new URLSearchParams(query).get('model');
  }

  return model;
}

function getRealtimeEventTokens(input: TokenInput) {
  const { resBody } = input;
  const responseObj: Tokens = {
    reqUnits: 0,
    resUnits: 0,
    cacheReadInputUnits: 0,
    cacheWriteInputUnits: 0, // OpenAI does not charge extra for cache writes.
  };
  if (resBody.type !== 'response.done') {
    return responseObj;
  }

  const { usage } = resBody.response;

  if (!usage) return responseObj;

  const {
    input_tokens,
    output_tokens,
    input_token_details,
    output_token_details,
  } = usage;

  responseObj.reqUnits = input_tokens;
  responseObj.resUnits = output_tokens;
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

const getAdditionalUnitsForResponses = (resBody: any) => {
  let file_search = 0;
  let web_search = 0;
  resBody.output?.forEach((item: any) => {
    if (item.type === 'web_search_call') {
      web_search += 1;
    } else if (item.type === 'file_search_call') {
      file_search += 1;
    }
  });

  return {
    web_search,
    file_search,
  };
};

const getAdditionalUnitsForChatCompletions = (resBody: any) => {
  const web_search = resBody?.choices?.[0]?.message?.annotations?.length
    ? 1
    : 0;
  return {
    web_search,
  };
};

export async function tokenConfig(input: TokenInput) {
  const { model, reqBody, resBody, url, portkeyHeaders, requestMethod } = input;
  let apiType: string | null = null;
  // Mapping to support azure models
  if (url.indexOf('/chat/completions') > -1 && requestMethod === 'POST') {
    apiType = 'chat';
  } else if (url.indexOf('/completions') > -1) {
    apiType = 'generate';
  } else if (url.indexOf('/audio/speech') > -1) {
    apiType = 'tts';
  } else if (url.indexOf('/realtime') > -1) {
    apiType = 'realtime';
  } else if (url.endsWith('/v1/responses') && requestMethod === 'POST') {
    apiType = 'responses';
  } else if (url.indexOf('/images/generations') > -1) {
    apiType = 'imageGenerate';
  } else if (url.indexOf('/audio/transcriptions') > -1) {
    apiType = 'transcription';
  } else if (url.indexOf('/audio/translations') > -1) {
    apiType = 'translation';
  } else if (url.indexOf('/images/edits') > -1) {
    apiType = 'imageEdit';
  } else if (requestMethod === 'POST' && url.indexOf('/v1/videos') > -1) {
    const videosIndex = url.indexOf('/v1/videos');
    const afterVideos = url.slice(videosIndex + '/v1/videos'.length);
    // Only match exact /v1/videos endpoint (not /v1/videos/remix, etc.)
    if (afterVideos === '' || afterVideos.startsWith('?')) {
      apiType = 'videos';
    }
  } else if (url.indexOf('/fine_tuning') > -1) {
    apiType = 'fineTuning';
  } else if (url.indexOf('/embeddings') > -1) {
    apiType = 'embed';
  }

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

  responseObj.cacheReadInputUnits =
    resBody.usage?.prompt_tokens_details?.cached_tokens || 0;
  responseObj.cacheWriteInputUnits = 0; // OpenAI does not charge extra for cache writes.

  if (resBody.usage?.prompt_tokens) {
    responseObj.reqUnits = resBody.usage?.prompt_tokens;
  }

  if (resBody.usage?.completion_tokens) {
    responseObj.resUnits = resBody.usage?.completion_tokens;
  }

  const additionalUnitsForChatCompletions =
    getAdditionalUnitsForChatCompletions(resBody);

  // Only check for prompt tokens as open ai always sends completion tokens
  // Skip default chatCompletions for specific api types
  if (responseObj.reqUnits && !['fineTuning'].includes(apiType)) {
    return {
      ...responseObj,
      additionalUnits: additionalUnitsForChatCompletions,
    };
  }

  switch (apiType) {
    case 'generate': {
      const mappedInput =
        typeof reqBody.prompt === 'string' ? [reqBody.prompt] : reqBody.prompt;
      const tokenizer = await openaiTokenize(mappedInput);
      return {
        reqUnits: tokenizer.data.units,
        resUnits: responseObj.resUnits,
      };
    }
    case 'chat': {
      const mappedInput = reqBody.messages;
      const tokenizer = await openaiTokenize(mappedInput);
      return {
        reqUnits: tokenizer.data.units,
        resUnits: responseObj.resUnits,
        additionalUnits: additionalUnitsForChatCompletions,
      };
    }
    case 'responses': {
      const additionalUnitsForResponses =
        getAdditionalUnitsForResponses(resBody);
      return {
        reqUnits: resBody.usage?.input_tokens ?? 0, // usage object is not present when background: true
        resUnits: resBody.usage?.output_tokens ?? 0,
        cacheReadInputUnits:
          resBody.usage?.input_tokens_details?.cached_tokens || 0,
        cacheWriteInputUnits: 0,
        additionalUnits: additionalUnitsForResponses,
      };
    }
    case 'tts': {
      const mappedInput = reqBody.input;
      const reqUnits = mappedInput.length;
      return {
        reqUnits,
        resUnits: 0,
      };
    }
    case 'imageGenerate': {
      if (resBody.usage) {
        return {
          reqUnits: resBody.usage.input_tokens,
          resUnits: resBody.usage.output_tokens,
        };
      }
      return responseObj;
    }
    case 'imageEdit': {
      if (resBody.usage) {
        return {
          reqUnits: resBody.usage.input_tokens,
          resUnits: resBody.usage.output_tokens,
          reqImageUnits: resBody.usage.input_tokens_details?.image_tokens || 0,
          resImageUnits: resBody.usage.output_tokens_details?.image_tokens || 0,
          reqTextUnits: resBody.usage.input_tokens_details?.text_tokens || 0,
          resTextUnits: resBody.usage.output_tokens_details?.text_tokens || 0,
          cachedImageUnits:
            resBody.usage.input_tokens_details?.cached_tokens_details
              ?.image_tokens || 0,
          cachedTextUnits:
            resBody.usage.input_tokens_details?.cached_tokens_details
              ?.text_tokens || 0,
        };
      }
      return responseObj;
    }
    case 'transcription':
    case 'translation': {
      const audioDurationInMins =
        (parseInt(portkeyHeaders[PORTKEY_HEADER_KEYS.AUDIO_FILE_DURATION]) ||
          0) / 60000;
      return {
        reqUnits: 0,
        resUnits: 0,
        additionalUnits: {
          request_audio_token: audioDurationInMins,
          response_audio_token: 0,
        },
      };
    }

    case 'videos': {
      const videoDurationInSeconds = Number(resBody.seconds) || 0; // coerce to number
      const videoSizeDimensions = resBody.size || '';
      const key = videoSizeDimensions
        ? `video_duration_seconds_${String(videoSizeDimensions).replace('x', '_')}`
        : 'video_duration_seconds';

      return {
        reqUnits: 0,
        resUnits: 0,
        additionalUnits: {
          [key]: videoDurationInSeconds,
        },
      };
    }
    case 'fineTuning': {
      const startTime = new Date(input.resBody?.created_at).getTime();
      const endTime = new Date(input.resBody?.finished_at).getTime();
      const totalHours = Math.max(
        Math.ceil((endTime - startTime) / 3600000),
        1
      ); // Round up to nearest hour
      return {
        reqUnits: 0, // tokens used for fine tuning training
        resUnits: 0,
        additionalUnits: {
          finetune_training_hours: totalHours,
          finetune_token_units: resBody.usage?.fine_tuning_tokens || 0,
        },
      };
    }
    case 'embed': {
      return {
        reqUnits: resBody.usage?.prompt_tokens || 0,
        resUnits: 0,
      };
    }
    default: {
      return responseObj;
    }
  }
}

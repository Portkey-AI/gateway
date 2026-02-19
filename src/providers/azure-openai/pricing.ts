import { getFallbackModelName, openaiTokenize } from '../../utils/pricing';
import { LogConfig, ModelInput, TokenInput, Tokens } from '../types';
import { logger } from '../../apm';
import { externalServiceFetch } from '../../utils/fetch';
import { PORTKEY_HEADER_KEYS } from '../../middlewares/portkey/globals';
import { AZURE_OPEN_AI } from '../../globals';
import { requestCache } from '../../services/cache/cacheService';
import { OrganisationDetails } from '../../middlewares/portkey/types';

export const AzureOpenAiLogConfig: LogConfig = {
  getBaseURL: getBaseURL,
  modelConfig: modelConfig,
  tokenConfig: tokenConfig,
};

function getBaseURL() {
  return '';
}

export async function modelConfig(input: ModelInput) {
  const {
    apiKey,
    resBody,
    url,
    providerOptions,
    isProxyCall,
    reqBody,
    headers,
  } = input;
  if (url.includes('/images/edits')) {
    // Return base model name from deployment config.
    if (providerOptions.azureModelName) {
      return providerOptions.azureModelName;
    }
    return reqBody?.model;
  }
  const fallbackModelName = getFallbackModelName(AZURE_OPEN_AI, url);
  let model: string = resBody.model;
  if (isProxyCall) {
    return fallbackModelName;
  }

  if (model?.includes('.ft')) {
    return model;
  }

  if (providerOptions.azureModelName) {
    model = providerOptions.azureModelName;
  }

  const isDataserviceRequest =
    headers?.[PORTKEY_HEADER_KEYS.IGNORE_SERVICE_LOG] === 'true';

  const isResponse = resBody.object === 'response';
  if (isDataserviceRequest && isResponse) {
    const resourceName = providerOptions.resourceName;
    const orgDetails = JSON.parse(
      headers?.[PORTKEY_HEADER_KEYS.ORGANISATION_DETAILS] || '{}'
    ) as OrganisationDetails;
    const cache = requestCache();
    const cacheKey = `azure-openai-model-${resourceName}-${model}-${orgDetails.id}`;
    const cachedResponse = await cache.get<{ model: string }>(cacheKey, {
      useLocalCache: true,
    });
    if (cachedResponse?.model) {
      return cachedResponse.model;
    }
    const url = `https://${resourceName}.openai.azure.com/openai/deployments/${model}?api-version=2022-12-01`;
    try {
      const response = await externalServiceFetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'api-key': apiKey || '',
        },
      });
      const data = (await response.json()) as Record<string, any>;
      model = data.model;
      await cache.set(cacheKey, { model });
      return model;
    } catch (error: any) {
      logger.error({
        message: `ERROR_FINDING_MODEL: ${error.message}`,
      });
    }
  }

  if (!model) {
    try {
      const azureUrl = new URL(url);
      const endpoint = azureUrl.origin;
      const deploymentId = azureUrl.pathname.split('/')[3];
      const response = await externalServiceFetch(
        `${endpoint}/openai/deployments/${deploymentId}?api-version=2022-12-01`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'api-key': apiKey || '',
          },
        }
      );
      const data = (await response.json()) as Record<string, any>;
      model = data.model || fallbackModelName;
    } catch (error: any) {
      logger.error({
        message: `ERROR_FINDING_MODEL: ${error.message}`,
      });
      model = fallbackModelName;
    }
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

const getAdditionalUnits = (resBody: any) => {
  let file_search_units = 0;
  resBody.output?.forEach((item: any) => {
    if (item.type === 'file_search_call') {
      file_search_units += 1;
    }
  });

  return {
    file_search: file_search_units,
  };
};

async function tokenConfig(input: TokenInput) {
  const { model, reqBody, resBody, url, portkeyHeaders, requestMethod } = input;
  let apiType;
  const shouldIncludeRoutingUnits = model?.includes('model-router');
  // Mapping to support azure models
  if (url.indexOf('/chat/completions') > -1 && requestMethod === 'POST') {
    apiType = 'chat';
  } else if (url.indexOf('/completions') > -1) {
    apiType = 'generate';
  } else if (url.indexOf('/audio/speech') > -1) {
    apiType = 'tts';
  } else if (url.indexOf('/realtime') > -1) {
    apiType = 'realtime';
  } else if (url.indexOf('/responses') > -1 && requestMethod === 'POST') {
    apiType = 'responses';
  } else if (url.indexOf('/images/generations') > -1) {
    apiType = 'imageGenerate';
  } else if (url.indexOf('/images/edits') > -1) {
    apiType = 'imageEdit';
  } else if (url.indexOf('/audio/transcriptions') > -1) {
    apiType = 'transcription';
  } else if (url.indexOf('/audio/translations') > -1) {
    apiType = 'translation';
  } else if (requestMethod === 'POST' && url.indexOf('/v1/videos') > -1) {
    const videosIndex = url.indexOf('/v1/videos');
    const afterVideos = url.slice(videosIndex + '/v1/videos'.length);
    // Only match exact /v1/videos endpoint (not /v1/videos/remix, etc.)
    if (afterVideos === '' || afterVideos.startsWith('?')) {
      apiType = 'videos';
    }
  } else if (url.indexOf('/fine_tuning') > -1) {
    apiType = 'fineTuning';
  }

  if (apiType === 'realtime') {
    return getRealtimeEventTokens(input);
  }

  const responseObj = {
    reqUnits: 0,
    resUnits: 0,
  } as Tokens;

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

  if (shouldIncludeRoutingUnits) {
    responseObj.additionalUnits = {
      ...responseObj.additionalUnits,
      routing_units: resBody.usage?.prompt_tokens, // routing cost units are input tokens
    };
  }

  if (
    responseObj.reqUnits &&
    responseObj.resUnits &&
    !['fineTuning'].includes(apiType ?? '')
  ) {
    return responseObj;
  }

  const additionalUnits = getAdditionalUnits(resBody);

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
    case 'responses': {
      return {
        reqUnits: resBody.usage?.input_tokens ?? 0, // usage object is not present when background: true
        resUnits: resBody.usage?.output_tokens ?? 0,
        cacheReadInputUnits:
          resBody.usage?.input_tokens_details?.cached_tokens || 0,
        cacheWriteInputUnits: 0,
        additionalUnits,
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
    default: {
      return responseObj;
    }
  }
}

export const getAzureOpenAIFineTuneModel = (model: string) => {
  const modelName = model.split('.')[0];
  return `${modelName}.ft`;
};

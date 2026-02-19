import { getFallbackModelName } from '../../utils/pricing';
import { LogConfig, ModelInput, TokenInput } from '../types';
import { BEDROCK } from '../../globals';

export const BedrockLogConfig: LogConfig = {
  getBaseURL: getBaseURL,
  modelConfig: modelConfig,
  tokenConfig: tokenConfig,
};

function getBaseURL() {
  return '';
}

async function modelConfig(input: ModelInput) {
  const { url } = input;
  let model = input.resBody.model || input.originalReqBody?.model;
  if (model?.length > 0) {
    model = decodeURIComponent(model);
    if (model.includes('arn:aws:bedrock')) {
      model = input.originalReqBody?.foundationModel || model.split('/').pop();
    }
    return model;
  }

  const fallbackModel = getFallbackModelName(BEDROCK, url);
  try {
    const bedrockURL = new URL(url);
    model = bedrockURL.pathname.split('/')[2];
    if (!model) {
      model = fallbackModel;
    }
  } catch (e) {
    model = fallbackModel;
  }
  return model;
}

function tokenConfig(input: TokenInput) {
  const { resBody } = input;
  if (
    resBody.usage?.input_tokens != null &&
    resBody.usage?.input_tokens != undefined
  ) {
    return {
      reqUnits:
        resBody.usage?.input_tokens +
        (resBody.usage?.cache_creation_input_tokens ?? 0) +
        (resBody.usage?.cache_read_input_tokens ?? 0),
      resUnits: resBody.usage?.output_tokens,
      cacheReadInputUnits: resBody.usage?.cache_read_input_tokens || 0,
      cacheWriteInputUnits: resBody.usage?.cache_creation_input_tokens || 0,
    };
  }
  return {
    reqUnits: resBody.usage?.prompt_tokens || 0,
    resUnits: resBody.usage?.completion_tokens || 0,
    cacheReadInputUnits: resBody.usage?.cache_read_input_tokens || 0,
    cacheWriteInputUnits: resBody.usage?.cache_creation_input_tokens || 0,
  };
}

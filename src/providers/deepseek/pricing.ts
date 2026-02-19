import { getDefaultModelName } from '../../utils/pricing';
import { LogConfig, ModelInput, TokenInput } from '../types';

const getBaseURL = () => 'https://api.deepseek.com/v1/';

export const DeepseekLogConfig: LogConfig = {
  getBaseURL: getBaseURL,
  modelConfig: modelConfig,
  tokenConfig: tokenConfig,
};

function modelConfig(input: ModelInput) {
  const { reqBody, resBody } = input;
  const model = getDefaultModelName(reqBody, resBody);
  return model;
}

function tokenConfig(input: TokenInput) {
  const { resBody } = input;
  return {
    reqUnits: resBody.usage?.prompt_tokens || 0,
    resUnits: resBody.usage?.completion_tokens || 0,
    cacheReadInputUnits:
      resBody.usage?.prompt_tokens_details?.cached_tokens || 0,
    cacheWriteInputUnits: 0, // Deepseek does not charge extra for cache writes.
  };
}

import { getDefaultModelName } from '../../utils/pricing';
import { LogConfig, ModelInput, TokenInput } from '../types';

const getBaseURL = () => 'https://api.deepbricks.ai/v1';

export const deepbricksConfig: LogConfig = {
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
  };
}

import { getDefaultModelName } from '../../utils/pricing';
import { LogConfig, ModelInput, TokenInput } from '../types';

export const DefaultLogConfig: LogConfig = {
  getBaseURL: getBaseURL,
  modelConfig: modelConfig,
  tokenConfig: tokenConfig,
};

function getBaseURL() {
  return '';
}

function modelConfig(input: ModelInput): string | Promise<string> {
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

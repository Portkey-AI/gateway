import { getDefaultModelName, getFallbackModelName } from '../../utils/pricing';
import { LogConfig, ModelInput, TokenInput } from '../types';
import { NOMIC } from '../../globals';

export const NomicLogConfig: LogConfig = {
  getBaseURL: getBaseURL,
  modelConfig: modelConfig,
  tokenConfig: tokenConfig,
};

function getBaseURL() {
  return 'https://api-atlas.nomic.ai/v1';
}

function modelConfig(input: ModelInput) {
  const { reqBody, resBody, url } = input;
  const model =
    getDefaultModelName(reqBody, resBody) || getFallbackModelName(NOMIC, url);
  return model;
}

function tokenConfig(input: TokenInput) {
  const { resBody } = input;
  return { reqUnits: resBody.usage?.total_tokens || 0, resUnits: 0 };
}

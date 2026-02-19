import { getDefaultModelName, getFallbackModelName } from '../../utils/pricing';
import { LogConfig, ModelInput, TokenInput } from '../types';
import { VOYAGE } from '../../globals';

export const VoyageLogConfig: LogConfig = {
  getBaseURL: getBaseURL,
  modelConfig: modelConfig,
  tokenConfig: tokenConfig,
};

function getBaseURL() {
  return 'https://api.voyageai.com/v1';
}

function modelConfig(input: ModelInput) {
  const { reqBody, resBody, url } = input;
  const model =
    getDefaultModelName(reqBody, resBody) || getFallbackModelName(VOYAGE, url);
  return model;
}

function tokenConfig(input: TokenInput) {
  const { resBody } = input;
  if (resBody.usage?.search_units) {
    return {
      reqUnits: resBody.usage.search_units,
      resUnits: 0,
    };
  }
  return { reqUnits: resBody.usage?.total_tokens || 0, resUnits: 0 };
}

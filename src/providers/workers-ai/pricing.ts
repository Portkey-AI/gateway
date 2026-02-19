import { getFallbackModelName } from '../../utils/pricing';
import { LogConfig, ModelInput, TokenInput } from '../types';
import { WORKERS_AI } from '../../globals';

export const WorkersAiLogConfig: LogConfig = {
  getBaseURL: getBaseURL,
  modelConfig: modelConfig,
  tokenConfig: tokenConfig,
};

function getBaseURL() {
  return '';
}

function modelConfig(input: ModelInput) {
  const { url } = input;
  let model;
  const fallbackModel = getFallbackModelName(WORKERS_AI, url);
  try {
    const workersAiUrl = new URL(url);
    model = workersAiUrl.pathname.split('/ai/run/')[1];
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
  return {
    reqUnits: resBody.usage?.prompt_tokens || 0,
    resUnits: resBody.usage?.completion_tokens || 0,
  };
}

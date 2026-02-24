import { getDefaultModelName } from '../../utils/pricing';
import { LogConfig, ModelInput, TokenInput } from '../types';

export const cerebrasAIConfig: LogConfig = {
  getBaseURL: () => 'https://api.cerebras.ai/v1',
  modelConfig: modelConfig,
  tokenConfig,
};

export function modelConfig(input: ModelInput) {
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

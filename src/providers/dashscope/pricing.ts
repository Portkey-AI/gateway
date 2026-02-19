import { getDefaultModelName } from '../../utils/pricing';
import { LogConfig, ModelInput, TokenInput } from '../types';

export const DashscopeLogConfig: LogConfig = {
  getBaseURL: () => 'https://dashscope.aliyuncs.com/compatible-mode/v1',
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

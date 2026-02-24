import { getFallbackModelName } from '../../utils/pricing';
import { LogConfig, ModelInput, TokenInput } from '../types';
import { tokenConfig as openAiTokenConfig } from '../openai/pricing';
import { OPENROUTER } from '../../globals';

export const OpenrouterLogConfig: LogConfig = {
  getBaseURL: getBaseURL,
  modelConfig: modelConfig,
  tokenConfig: tokenConfig,
};

function getBaseURL() {
  return 'https://openrouter.ai/api';
}

function modelConfig(input: ModelInput) {
  const { reqBody, resBody, url } = input;
  let model = reqBody.model;
  if (!model || model === 'openrouter/auto') {
    model = resBody.model;
  }
  model = model || getFallbackModelName(OPENROUTER, url);
  return model;
}

function tokenConfig(input: TokenInput) {
  input.model = 'gpt-3.5-turbo';
  return openAiTokenConfig(input);
}

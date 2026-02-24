import { getFallbackModelName } from '../../utils/pricing';
import { LogConfig, ModelInput, TokenInput } from '../types';
import { tokenConfig as openAiTokenConfig } from '../openai/pricing';
import { PREDIBASE } from '../../globals';

export const PredibaseLogConfig: LogConfig = {
  getBaseURL: getBaseURL,
  modelConfig: modelConfig,
  tokenConfig: tokenConfig,
};

function getBaseURL() {
  return 'https://serving.app.predibase.com';
}

function modelConfig(input: ModelInput) {
  const { url } = input;
  let model;
  const fallbackModel = getFallbackModelName(PREDIBASE, url);
  try {
    const predibaseURL = new URL(url);
    model = predibaseURL.pathname.split('/')[5];
    if (!model) {
      model = fallbackModel;
    }
  } catch (e) {
    model = fallbackModel;
  }
  return model;
}

function tokenConfig(input: TokenInput) {
  input.model = 'gpt-3.5-turbo';
  return openAiTokenConfig(input);
}

import { LogConfig, ModelInput, TokenInput } from '../types';

function getBaseURL() {
  return '';
}

function modelConfig(input: ModelInput): string | Promise<string> {
  const { resBody, reqBody } = input;
  // prefer resBody model first, model passed in request body might not be present in body.
  return resBody.model || reqBody.model;
}

function tokenConfig(input: TokenInput) {
  const { resBody } = input;
  return {
    reqUnits: resBody.usage?.prompt_tokens || 0,
    resUnits: resBody.usage?.completion_tokens || 0,
  };
}

export const AzureAiLogConfig: LogConfig = {
  getBaseURL: getBaseURL,
  modelConfig: modelConfig,
  tokenConfig: tokenConfig,
};

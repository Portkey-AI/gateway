import {
  getDefaultModelName,
  getFallbackModelName,
  openaiTokenize,
} from '../../utils/pricing';
import { LogConfig, ModelInput, TokenInput } from '../types';
import { MISTRAL_AI } from '../../globals';

export const MistralAiLogConfig: LogConfig = {
  getBaseURL: getBaseURL,
  modelConfig: modelConfig,
  tokenConfig: tokenConfig,
};

function getBaseURL() {
  return 'https://api.mistral.ai/v1';
}

function modelConfig(input: ModelInput) {
  const { reqBody, resBody, url } = input;
  const model =
    getDefaultModelName(reqBody, resBody) ||
    getFallbackModelName(MISTRAL_AI, url);
  return model;
}

async function tokenConfig(input: TokenInput) {
  const { reqBody, resBody, url } = input;
  const responseObj = {
    reqUnits: 0,
    resUnits: 0,
  };

  if (resBody.usage?.prompt_tokens) {
    responseObj.reqUnits = resBody.usage?.prompt_tokens;
  }

  // embeddings only has prompt_tokens
  if (responseObj.reqUnits && url.endsWith('/embeddings')) {
    return responseObj;
  }

  if (resBody.usage?.completion_tokens) {
    responseObj.resUnits = resBody.usage?.completion_tokens;
  }

  // Mistral either sends both token counts or none.
  // If both are present then return. Else calculate using openAI tokenizer
  if (responseObj.reqUnits && responseObj.resUnits) {
    return responseObj;
  }

  const mappedInput = reqBody.messages;
  const inputTokenizer = await openaiTokenize(mappedInput);

  const mappedOutput = resBody.choices.map(
    (c: Record<string, any>) => c.message
  );
  const outputTokenizer = await openaiTokenize(mappedOutput);
  return {
    reqUnits: inputTokenizer.data.units,
    resUnits: outputTokenizer.data.units,
  };
}

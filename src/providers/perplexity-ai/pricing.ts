import { getDefaultModelName, getFallbackModelName } from '../../utils/pricing';
import { LogConfig, ModelInput, TokenInput, Tokens } from '../types';
import { tokenConfig as openAiTokenConfig } from '../openai/pricing';
import { PERPLEXITY_AI } from '../../globals';

export const PerplexityAiLogConfig: LogConfig = {
  getBaseURL: getBaseURL,
  modelConfig: modelConfig,
  tokenConfig: tokenConfig,
};

function getBaseURL() {
  return 'https://api.perplexity.ai';
}

function modelConfig(input: ModelInput) {
  const { reqBody, resBody, url } = input;
  const model =
    getDefaultModelName(reqBody, resBody) ||
    getFallbackModelName(PERPLEXITY_AI, url);
  return model;
}

const getAdditionalUnits = (reqBody: any, resBody: any) => {
  let web_search_low_context = 0;
  let web_search_medium_context = 0;
  let web_search_high_context = 0;
  const web_search = resBody?.usage?.num_search_queries ?? 0;
  const search_context_size = reqBody?.web_search_options?.search_context_size;
  switch (search_context_size) {
    case 'low':
      web_search_low_context = 1;
      break;
    case 'medium':
      web_search_medium_context = 1;
      break;
    case 'high':
      web_search_high_context = 1;
      break;
    default:
      web_search_low_context = 1;
      break;
  }
  return {
    web_search_low_context,
    web_search_medium_context,
    web_search_high_context,
    web_search, // this is for sonar-deep-research model
  };
};

async function tokenConfig(input: TokenInput) {
  const { resBody, reqBody } = input;
  const additionalUnits = getAdditionalUnits(reqBody, resBody);
  input.model = 'gpt-3.5-turbo';
  const tokens: Tokens = await openAiTokenConfig(input);
  if (additionalUnits) {
    tokens.additionalUnits = additionalUnits;
  }
  return tokens;
}

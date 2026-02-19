import {
  getDefaultModelName,
  getFallbackModelName,
  openaiTokenize,
} from '../../utils/pricing';
import { LogConfig, ModelInput, TokenInput } from '../types';
import { NOVITA_AI } from '../../globals';

export const NovitaLogConfig: LogConfig = {
  getBaseURL: getBaseURL,
  modelConfig: modelConfig,
  tokenConfig: tokenConfig,
};

function getBaseURL() {
  return 'https://api.novita.ai/v3/openai';
}

function modelConfig(input: ModelInput) {
  const { reqBody, resBody, url } = input;
  const model =
    getDefaultModelName(reqBody, resBody) ||
    getFallbackModelName(NOVITA_AI, url);
  return model;
}

async function tokenConfig(input: TokenInput) {
  const { reqBody, resBody, url } = input;

  let apiType: string = '';

  if (url.indexOf('/chat/completions') > -1) {
    apiType = 'chatComplete';
  } else if (url.indexOf('/completions') > -1) {
    apiType = 'complete';
  }

  const responseObj = {
    reqUnits: 0,
    resUnits: 0,
  };

  if (resBody.usage?.prompt_tokens) {
    responseObj.reqUnits = resBody.usage?.prompt_tokens;
  }

  if (resBody.usage?.completion_tokens) {
    responseObj.resUnits = resBody.usage?.completion_tokens;
  }

  if (responseObj.reqUnits && responseObj.resUnits) {
    return responseObj;
  }

  switch (apiType) {
    case 'chatComplete': {
      const messageTokenizer = await openaiTokenize(reqBody.messages);

      const mappedMessages = resBody.choices.map(
        (c: Record<string, any>) => c.message
      );

      const messageOutputTokenizer = await openaiTokenize(mappedMessages);

      responseObj.reqUnits = messageTokenizer.data.units;
      responseObj.resUnits = messageOutputTokenizer.data.units;

      break;
    }

    case 'complete': {
      const mappedPrompt =
        typeof reqBody.prompt === 'string' ? [reqBody.prompt] : reqBody.prompt;
      const promptTokenizer = await openaiTokenize(mappedPrompt);

      const mappedPromptOutput = resBody.choices.map(
        (p: Record<string, any>) => p.text
      );

      const mappedPromptOutputTokenizer =
        await openaiTokenize(mappedPromptOutput);

      responseObj.reqUnits = promptTokenizer.data.units;
      responseObj.resUnits = mappedPromptOutputTokenizer.data.units;

      break;
    }

    default:
      responseObj.reqUnits = 0;
      responseObj.resUnits = 0;
  }

  return responseObj;
}

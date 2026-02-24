import {
  getDefaultModelName,
  getFallbackModelName,
  openaiTokenize,
} from '../../utils/pricing';
import { LogConfig, ModelInput, TokenInput, Tokens } from '../types';
import { ANTHROPIC } from '../../globals';

export const AnthropicLogConfig: LogConfig = {
  getBaseURL: getBaseURL,
  modelConfig: modelConfig,
  tokenConfig: tokenConfig,
};

function getBaseURL() {
  return 'https://api.anthropic.com/v1';
}

function modelConfig(input: ModelInput) {
  const { reqBody, resBody, url } = input;
  const model =
    getDefaultModelName(reqBody, resBody) ||
    getFallbackModelName(ANTHROPIC, url);
  return model;
}

async function tokenConfig(input: TokenInput): Promise<Tokens> {
  const { reqBody, resBody, url } = input;

  // openai chat/completions route
  if (resBody.usage?.prompt_tokens && resBody.usage?.completion_tokens) {
    return {
      reqUnits: resBody.usage?.prompt_tokens,
      resUnits: resBody.usage?.completion_tokens,
      cacheReadInputUnits: resBody.usage?.cache_read_input_tokens,
      cacheWriteInputUnits: resBody.usage?.cache_creation_input_tokens,
    };
  }

  // anthropic messages route
  if (
    resBody.usage?.input_tokens != null &&
    resBody.usage?.input_tokens != undefined
  ) {
    return {
      reqUnits:
        resBody.usage?.input_tokens +
        (resBody.usage?.cache_creation_input_tokens ?? 0) +
        (resBody.usage?.cache_read_input_tokens ?? 0),
      resUnits: resBody.usage?.output_tokens,
      cacheReadInputUnits: resBody.usage?.cache_read_input_tokens,
      cacheWriteInputUnits: resBody.usage?.cache_creation_input_tokens,
    };
  }

  let apiType = '';
  if (url.indexOf('messages') > -1 && !url.includes('/count_tokens')) {
    apiType = 'messages';
  } else if (url.indexOf('complete') > -1) {
    apiType = 'complete';
  }

  switch (apiType) {
    case 'complete': {
      const prompt =
        typeof reqBody.prompt === 'string' ? [reqBody.prompt] : reqBody.prompt;
      const promptTokenizer = await openaiTokenize(prompt);

      let completion = resBody.completion;
      if (resBody.choices && resBody.choices[0]?.text) {
        completion = resBody.choices[0].text;
      }
      const completionTokenizer = await openaiTokenize([completion]);
      return {
        reqUnits: promptTokenizer.data.units,
        resUnits: completionTokenizer.data.units,
      };
    }

    case 'messages': {
      const inputMessages = [...reqBody.messages];
      if (reqBody.system) {
        inputMessages.push({
          role: 'system',
          content: reqBody.system,
        });
      }

      const inputMessagesTokenizer = await openaiTokenize(inputMessages);

      let outputMessages;
      if (resBody.choices && resBody.choices[0]?.message) {
        outputMessages = [resBody.choices[0].message];
      } else {
        outputMessages = [
          {
            role: 'assistant',
            content: resBody.content[0].text,
          },
        ];
      }

      const chatTokenizer = await openaiTokenize(outputMessages);
      return {
        reqUnits: inputMessagesTokenizer.data.units,
        resUnits: chatTokenizer.data.units,
      };
    }

    default:
      return {
        reqUnits: 0,
        resUnits: 0,
      };
  }
}

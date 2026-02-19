import {
  getDefaultModelName,
  getFallbackModelName,
  openaiTokenize,
} from '../../utils/pricing';
import { LogConfig, ModelInput, TokenInput } from '../types';
import { AI21 } from '../../globals';

export const Ai21LogConfig: LogConfig = {
  getBaseURL: getBaseURL,
  modelConfig: modelConfig,
  tokenConfig: tokenConfig,
};

function getBaseURL() {
  return 'https://api.ai21.com/studio/v1';
}

function modelConfig(input: ModelInput) {
  const { reqBody, resBody, url } = input;
  let model: string = getDefaultModelName(reqBody, resBody);
  if (!model) {
    const fallbackModel = getFallbackModelName(AI21, url);
    try {
      const ai21URL = new URL(url);
      model = ai21URL.pathname.split('/')[3];
      if (!model) {
        model = fallbackModel;
      }
    } catch (e) {
      model = fallbackModel;
    }
  }
  return model;
}

async function tokenConfig(input: TokenInput) {
  const { reqBody, resBody, url } = input;
  if (resBody.usage?.prompt_tokens && resBody.usage?.completion_tokens) {
    return {
      reqUnits: resBody.usage?.prompt_tokens,
      resUnits: resBody.usage?.completion_tokens,
    };
  }
  let apiType;

  if (url.endsWith('/chat')) {
    apiType = 'chat';
  } else if (url.endsWith('/complete')) {
    apiType = 'complete';
  } else if (url.endsWith('/embed')) {
    apiType = 'embed';
  }
  switch (apiType) {
    case 'chat': {
      const mappedInput = reqBody.messages.map((m: Record<string, any>) => ({
        role: m.role,
        content: m.text || m.content,
      }));
      const inputTokenizer = await openaiTokenize(mappedInput);

      const mappedOutput = resBody.outputs
        ? resBody.outputs.map((o: Record<string, any>) => ({
            role: o.role,
            content: o.text,
          }))
        : resBody.choices.map((c: Record<string, any>) => ({
            role: c.role,
            content: c.content,
          }));
      const outputTokenizer = await openaiTokenize(mappedOutput);

      return {
        reqUnits: inputTokenizer.data.units,
        resUnits: outputTokenizer.data.units,
      };
    }
    case 'proxy-embed': {
      const mappedInput = reqBody.texts;
      const inputTokenizer = await openaiTokenize(mappedInput);

      return {
        reqUnits: inputTokenizer.data.units,
        resUnits: 0,
      };
    }
    case 'embed': {
      const mappedInput = Array.isArray(reqBody.texts)
        ? reqBody.texts
        : [reqBody.texts];
      const inputTokenizer = await openaiTokenize(mappedInput);

      return {
        reqUnits: inputTokenizer.data.units,
        resUnits: 0,
      };
    }

    default: {
      return {
        reqUnits: 0,
        resUnits: 0,
      };
    }
  }
}

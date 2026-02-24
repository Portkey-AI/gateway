import {
  getDefaultModelName,
  getFallbackModelName,
  openaiTokenize,
} from '../../utils/pricing';
import { LogConfig, ModelInput, TokenInput, Tokens } from '../types';
import { TOGETHER_AI } from '../../globals';
import { getPricingConfig } from '../../services/winky/handlers/modelConfig';

export const TogetherAiLogConfig: LogConfig = {
  getBaseURL: getBaseURL,
  modelConfig: modelConfig,
  tokenConfig: tokenConfig,
};

function getBaseURL() {
  return 'https://api.together.xyz';
}

function modelConfig(input: ModelInput) {
  const { reqBody, resBody, url } = input;
  const model =
    getDefaultModelName(reqBody, resBody) ||
    getFallbackModelName(TOGETHER_AI, url);
  return model;
}

const getAdditionalUnits = (
  originalReqBody: any,
  defaultStepsConst: number
) => {
  const width = Number(originalReqBody?.width) || 1024;
  const height = Number(originalReqBody?.height) || 1024;
  const steps = Number(originalReqBody?.steps) || defaultStepsConst;
  const n = Number(originalReqBody?.n) || 1;

  const mpPerImage = width > 0 && height > 0 ? (width * height) / 1_000_000 : 0;
  const totalMp = mpPerImage * n;

  // Only increase cost when steps exceed default; never decrease below default
  const factor =
    defaultStepsConst > 0 && steps > defaultStepsConst
      ? steps / defaultStepsConst
      : 1;

  return {
    megapixels: totalMp * factor,
  };
};

async function tokenConfig(input: TokenInput) {
  const { reqBody, resBody, url } = input;
  let apiType = '';
  if (url.indexOf('/chat/completions') > -1) {
    apiType = 'chat';
  } else if (url.indexOf('/completions') > -1) {
    apiType = 'generate';
  } else if (url.indexOf('/inference') > -1) {
    apiType = 'inference';
  } else if (url.indexOf('/embeddings') > -1) {
    apiType = 'embeddings';
  } else if (url.indexOf('/images/generations') > -1) {
    apiType = 'imageGenerate';
  }
  switch (apiType) {
    case 'generate': {
      let inputTokens;
      if (resBody.usage?.prompt_tokens) {
        inputTokens = resBody.usage?.prompt_tokens;
      } else {
        const mappedInput =
          typeof reqBody.prompt === 'string'
            ? [reqBody.prompt]
            : reqBody.prompt;
        inputTokens = (await openaiTokenize(mappedInput)).data.units;
      }
      let outputTokens;
      if (resBody.usage?.completion_tokens) {
        outputTokens = resBody.usage?.completion_tokens;
      } else {
        const output = resBody.choices.map((c: Record<string, any>) => c.text);
        outputTokens = (await openaiTokenize(output)).data.units;
      }
      return {
        reqUnits: inputTokens,
        resUnits: outputTokens,
      };
    }
    case 'chat': {
      let inputTokens;
      if (resBody.usage?.prompt_tokens) {
        inputTokens = resBody.usage?.prompt_tokens;
      } else {
        const mappedInput = reqBody.messages;
        inputTokens = (await openaiTokenize(mappedInput)).data.units;
      }
      let outputTokens;
      if (resBody.usage?.completion_tokens) {
        outputTokens = resBody.usage?.completion_tokens;
      } else {
        const output = resBody.choices.map(
          (c: Record<string, any>) => c.message
        );
        outputTokens = (await openaiTokenize(output)).data.units;
      }
      return {
        reqUnits: inputTokens,
        resUnits: outputTokens,
      };
    }
    case 'inference': {
      const mappedInput =
        typeof reqBody.prompt === 'string' ? [reqBody.prompt] : reqBody.prompt;
      const tokenizer = await openaiTokenize(mappedInput);
      const output = resBody.output.choices.map(
        (p: Record<string, any>) => p.text
      );
      const outputTokenizer = await openaiTokenize(output);
      return {
        reqUnits: tokenizer.data.units,
        resUnits: outputTokenizer.data.units,
      };
    }
    case 'embeddings': {
      const mappedInput =
        typeof reqBody.input === 'string' ? [reqBody.input] : reqBody.input;
      const tokenizer = await openaiTokenize(mappedInput);
      return {
        reqUnits: tokenizer.data.units,
        resUnits: 0,
      };
    }
    case 'imageGenerate': {
      const model = reqBody.model;
      const urlForPricing = url;

      // Fetch base pricing to read default steps constant from pricing JSON
      const basePricing = await getPricingConfig(
        TOGETHER_AI,
        {
          model,
          url: urlForPricing,
          reqUnits: 0,
          resUnits: 0,
          requestBody: reqBody,
          responseBody: resBody,
        },
        input.env
      );

      // after fetching basePricing
      const defaultStepsConst =
        (basePricing?.pay_as_you_go?.additional_units as any)?.['default_steps']
          ?.price || 0;

      // If default_steps is not configured, skip additionalUnits
      if (!defaultStepsConst) {
        const tokens: Tokens = {
          reqUnits: 0,
          resUnits: 0,
        };

        return tokens;
      }

      const requestData = reqBody;
      const additionalUnits = getAdditionalUnits(
        requestData,
        defaultStepsConst
      ) as Tokens['additionalUnits'];

      const tokens: Tokens = {
        reqUnits: 0,
        resUnits: 0,
        additionalUnits,
      };

      return tokens;
    }

    default: {
      return {
        reqUnits: 0,
        resUnits: 0,
      };
    }
  }
}

import { getDefaultModelName, getFallbackModelName } from '../../utils/pricing';
import { LogConfig, ModelInput, TokenInput } from '../types';
import { palmTokenize } from '../palm/pricing';
import { GOOGLE } from '../../globals';

export const GoogleLogConfig: LogConfig = {
  getBaseURL: getBaseURL,
  modelConfig: modelConfig,
  tokenConfig: tokenConfig,
};

function getBaseURL() {
  return 'https://generativelanguage.googleapis.com/v1beta';
}

function modelConfig(input: ModelInput) {
  const { reqBody, resBody, url } = input;
  let model = getDefaultModelName(reqBody, resBody);
  if (!model) {
    try {
      const googleUrl = new URL(url);
      model = googleUrl.pathname.split('/')[3].split(':')[0];
    } catch (e) {
      model = getFallbackModelName(GOOGLE, url);
    }
  }
  return model;
}

async function tokenConfig(input: TokenInput) {
  const { reqBody, resBody, url, originalResBody } = input;
  let apiType = 'generateContent';
  if (url.indexOf('embedContent') > -1) {
    apiType = 'embedContent';
  }
  let search = 0;
  let maps = 0;
  const responseCandidates = originalResBody?.candidates || resBody?.choices;
  const containsGroundingChunks = responseCandidates?.filter(
    (choice: any) =>
      choice?.groundingMetadata?.groundingChunks &&
      choice.groundingMetadata.groundingChunks.length > 0
  );
  if (containsGroundingChunks?.length > 0) {
    // get grounding chunks from all choices.
    const groundingChunks = responseCandidates
      .map((choice: any) => choice.groundingMetadata.groundingChunks)
      ?.flat();
    // get the chunks that has maps object.
    const mapRequestCount = groundingChunks?.filter((chunk: any) =>
      Boolean(chunk['maps'])
    ).length;
    // get the chunks that has web object.
    const webRequestCount = groundingChunks?.filter((chunk: any) =>
      Boolean(chunk['web'])
    ).length;

    search = webRequestCount > 0 ? 1 : 0;
    maps = mapRequestCount > 0 ? 1 : 0;
  }

  // handle image generation models like gemini-2.5-flash-image
  const imageTokens =
    originalResBody?.usageMetadata?.candidatesTokensDetails?.reduce(
      (acc: any, curr: any) => {
        return acc + (curr.modality === 'IMAGE' ? curr.tokenCount : 0);
      },
      0
    );

  switch (apiType) {
    case 'embedContent': {
      const mappedInput = reqBody.content?.parts.map(
        (p: Record<string, any>) => p.text
      );
      if (reqBody.input) {
        if (Array.isArray(reqBody.input)) mappedInput.push(...reqBody.input);
        else {
          mappedInput.push(reqBody.input);
        }
      }
      let tokens = 0;
      mappedInput.forEach((i: string) => {
        tokens += palmTokenize(i).data.token_count;
      });
      return {
        reqUnits: tokens,
        resUnits: 0,
      };
    }

    default: {
      return {
        reqUnits: resBody.usage?.prompt_tokens || 0,
        resUnits: resBody.usage?.completion_tokens || 0,
        cacheReadInputUnits:
          resBody.usage?.prompt_tokens_details?.cached_tokens || 0,
        additionalUnits: {
          web_search: search,
          maps: maps,
          thinking_token:
            resBody?.usage?.completion_tokens_details?.reasoning_tokens || 0,
          image_token: imageTokens || 0,
        },
      };
    }
  }
}

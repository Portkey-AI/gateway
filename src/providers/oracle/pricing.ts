import { ORACLE } from '../../globals';
import { getDefaultModelName, getFallbackModelName } from '../../utils/pricing';
import { LogConfig, ModelInput, TokenInput } from '../types';

export const OracleLogConfig: LogConfig = {
  getBaseURL: getBaseURL,
  modelConfig: modelConfig,
  tokenConfig: tokenConfig,
};

function getBaseURL() {
  return 'https://api.endpoints.anyscale.com/v1';
}

function modelConfig(input: ModelInput) {
  const { reqBody, resBody, url } = input;
  const model =
    getDefaultModelName(reqBody, resBody) || getFallbackModelName(ORACLE, url);
  return model;
}

function tokenConfig(input: TokenInput) {
  if (input.resBody.usage) {
    return {
      reqUnits: input.resBody.usage.prompt_tokens ?? 0,
      resUnits: input.resBody.usage.completion_tokens ?? 0,
      cacheReadInputUnits:
        input.resBody.usage.prompt_tokens_details?.cached_tokens ?? 0,
      cacheWriteInputUnits: 0,
    };
  }
  return {
    reqUnits: input.originalReqBody?.messages?.reduce(
      (acc: number, curr: any) => {
        const content =
          typeof curr.content === 'string'
            ? curr.content
            : curr.content.text ?? '';
        return acc + Math.ceil(content.length / 4); // 4 characters per token
      },
      0
    ),
    resUnits: Math.ceil(
      (input.resBody.choices?.[0]?.message?.content?.length ?? 0) / 4
    ),
  };
}

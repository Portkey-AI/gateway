import { logger } from '../../../apm';
import { getPricingConfig } from '../handlers/modelConfig';
import { Tokens } from '../../../providers/types';
import { getProviderLogConfig, getURL } from '../utils/helpers';
import { calculateCost } from './cost';

export async function calculateTokens({
  env,
  provider,
  isSuccess,
  requestURL,
  responseBody,
  providerOptions,
  requestMethod,
  requestHeaders,
}: {
  env: Record<string, any>;
  provider: string;
  isSuccess: boolean;
  requestURL: string;
  responseBody: Record<string, any>;
  providerOptions?: Record<string, any>;
  requestMethod?: string;
  requestHeaders?: Record<string, string>;
}) {
  let tokens: Tokens = {
    reqUnits: 0,
    resUnits: 0,
    cacheWriteInputUnits: 0,
    cacheReadInputUnits: 0,
    cacheReadAudioInputUnits: 0,
    resAudioUnits: 0,
    resTextUnits: 0,
    reqTextUnits: 0,
    reqAudioUnits: 0,
    additionalUnits: {
      web_search: 0,
      web_search_low_context: 0,
      web_search_medium_context: 0,
      web_search_high_context: 0,
      file_search: 0,
    },
  };

  const providerLogConfig = getProviderLogConfig(provider);
  requestURL = getURL(requestURL, providerLogConfig.getBaseURL());
  if (isSuccess) {
    try {
      const model = await providerLogConfig.modelConfig({
        apiKey: providerOptions?.apiKey || '',
        env,
        reqBody: {},
        resBody: responseBody,
        isProxyCall: false,
        url: requestURL,
        providerOptions: providerOptions || {},
        headers: requestHeaders,
      });
      const calculatedTokens = await providerLogConfig.tokenConfig({
        env,
        model: model,
        reqBody: {},
        resBody: responseBody,
        url: requestURL,
        portkeyHeaders: {},
        requestMethod: requestMethod,
      });
      tokens = { ...tokens, ...calculatedTokens };
    } catch (error: any) {
      logger.error({
        message: `ERROR_FINDING_UNITS: ${error.message}`,
      });
    }
  }

  return tokens;
}

export async function calculateTokenCost({
  env,
  provider,
  tokens,
  requestURL,
  responseBody,
  providerOptions,
  requestHeaders,
  isBatch = false,
}: {
  env: Record<string, any>;
  provider: string;
  tokens: Tokens;
  requestURL: string;
  responseBody: Record<string, any>;
  providerOptions?: Record<string, any>;
  requestHeaders?: Record<string, string>;
  isBatch?: boolean;
}) {
  let tokenCost = 0;
  let tokenCurrency = 'USD';
  const providerLogConfig = getProviderLogConfig(provider);
  try {
    const model = await providerLogConfig.modelConfig({
      apiKey: '',
      env,
      reqBody: {},
      resBody: responseBody,
      isProxyCall: false,
      url: requestURL,
      providerOptions: {},
    });
    const priceConfig = await getPricingConfig(
      provider,
      {
        model,
        url: requestURL,
        reqUnits: tokens.reqUnits,
        resUnits: tokens.resUnits,
        requestBody: {},
        responseBody: responseBody,
        providerOptions: providerOptions || {},
        headers: requestHeaders,
      },
      env
    );
    const cost = calculateCost(
      tokens,
      priceConfig ?? null,
      {},
      responseBody.error ? false : true, //TODO: Check if this is correct,
      isBatch
    );
    const { requestCost, responseCost, currency } = cost;
    tokenCost = parseFloat(`${requestCost}`) + parseFloat(`${responseCost}`);
    tokenCurrency = currency;
  } catch (error: any) {
    tokenCost = 0;
    tokenCurrency = 'USD';
    logger.error({
      message: `ERROR_FETCHING_COST: ${error.message}`,
    });
  }
  return { cost: tokenCost, currency: tokenCurrency };
}

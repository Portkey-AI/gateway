import { Context } from 'hono';
import {
  calculateTokenCost,
  calculateTokens,
} from '../services/winky/lookers/tokenizer';
import { env } from 'hono/adapter';
import { logger } from '../apm';
import { constructConfigFromRequestHeaders } from '../utils/request';

export async function tokenizerHandler(c: Context): Promise<Response> {
  const reqBody = c.get('requestBodyData').bodyJSON;
  const headers = c.get('mappedHeaders');
  const providerOptions = constructConfigFromRequestHeaders(headers || {});
  const {
    provider,
    response_body: responses,
    request_url: requestURL,
    is_batch: isBatch = false,
  } = reqBody;
  const finalTokens = {
    requestUnits: 0,
    responseUnits: 0,
    totalUnits: 0,
    cacheUnits: {
      cacheWriteInputUnits: 0,
      cacheReadInputUnits: 0,
      cacheReadAudioInputUnits: 0,
    },
    inputUnitDetails: {
      textUnits: 0,
      audioUnits: 0,
    },
    outputUnitDetails: {
      textUnits: 0,
      audioUnits: 0,
    },
  };

  const finalCost = {
    cost: 0,
    currency: 'USD',
  };

  for (const response of responses) {
    try {
      const tokens = await calculateTokens({
        env: env(c),
        isSuccess: true,
        provider: provider,
        responseBody: response,
        requestURL: requestURL,
        providerOptions: providerOptions,
        requestMethod: c.req.method,
        requestHeaders: headers,
      });
      const tokenCost = await calculateTokenCost({
        env: env(c),
        provider: provider,
        tokens: tokens,
        responseBody: response,
        requestURL: requestURL,
        providerOptions: providerOptions,
        requestHeaders: headers,
        isBatch: isBatch,
      });

      finalCost.cost += tokenCost.cost || 0;
      finalTokens.requestUnits += tokens.reqUnits || 0;
      finalTokens.responseUnits += tokens.resUnits || 0;
      finalTokens.totalUnits += tokens.reqUnits + tokens.resUnits || 0;
      finalTokens.cacheUnits = {
        cacheWriteInputUnits:
          finalTokens.cacheUnits.cacheWriteInputUnits +
          (tokens.cacheWriteInputUnits || 0),
        cacheReadInputUnits:
          finalTokens.cacheUnits.cacheReadInputUnits +
          (tokens.cacheReadInputUnits || 0),
        cacheReadAudioInputUnits:
          finalTokens.cacheUnits.cacheReadAudioInputUnits +
          (tokens.cacheReadAudioInputUnits || 0),
      };
      finalTokens.inputUnitDetails = {
        textUnits:
          finalTokens.inputUnitDetails.textUnits + (tokens.reqTextUnits || 0),
        audioUnits:
          finalTokens.inputUnitDetails.audioUnits + (tokens.reqAudioUnits || 0),
      };
      finalTokens.outputUnitDetails = {
        textUnits:
          finalTokens.outputUnitDetails.textUnits + (tokens.resTextUnits || 0),
        audioUnits:
          finalTokens.outputUnitDetails.audioUnits +
          (tokens.resAudioUnits || 0),
      };
    } catch (err: any) {
      logger.error({
        message: `tokenizerHandler error: ${err.message}`,
      });
    }
  }

  return new Response(
    JSON.stringify({
      tokens: finalTokens,
      cost: finalCost,
    }),
    {
      status: 200,
      headers: {
        'content-type': 'application/json',
      },
    }
  );
}

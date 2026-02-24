import { PORTKEY_HEADER_KEYS } from '../../middlewares/portkey/globals';
import { externalServiceFetch } from '../../utils/fetch';
import { Environment } from '../../utils/env';
import {
  aiProviderUrlModelMapping,
  getDefaultModelName,
} from '../../utils/pricing';
import { LogConfig, ModelInput, TokenInput } from '../types';

export const CohereLogConfig: LogConfig = {
  getBaseURL: getBaseURL,
  modelConfig: modelConfig,
  tokenConfig: tokenConfig,
};

function getBaseURL() {
  return 'https://api.cohere.ai/v1';
}

function modelConfig(input: ModelInput) {
  const { reqBody, resBody, url } = input;
  let model = getDefaultModelName(reqBody, resBody);
  if (!model) {
    model = aiProviderUrlModelMapping[url] || url;
  }
  return model;
}

function tokenConfig(input: TokenInput) {
  const { env, model, reqBody, resBody, url } = input;
  const apiType = aiProviderUrlTypeMapping[url];
  switch (apiType) {
    case 'generate': {
      // support rubeus response
      let generations =
        resBody.generations?.map((g: Record<string, any>) => g.text) ?? [];

      if (resBody.choices && resBody.choices[0]?.text) {
        generations = resBody.choices.map((c: Record<string, any>) => c.text);
      }
      if (resBody.choices && resBody.choices[0]?.message) {
        generations = resBody.choices.map(
          (c: Record<string, any>) => c.message.content
        );
      }
      return getCohereGenerateTokens(
        Environment(env),
        reqBody.prompt,
        generations,
        model
      );
    }
    case 'embed': {
      return getCohereEmbedTokens(Environment(env), reqBody.texts, model);
    }
    case 'classify': {
      return getCohereClassificationTokens(reqBody.inputs);
    }
    case 'summarize': {
      return getCohereSummariseTokens(
        Environment(env),
        reqBody.text,
        resBody.summary,
        model
      );
    }
    case 'rerank': {
      return {
        reqUnits: resBody.usage.search_units,
        resUnits: 0,
      };
    }
    default: {
      return {
        resUnits: 0,
        reqUnits: 0,
      };
    }
  }
}

const aiProviderUrlTypeMapping: Record<string, string> = {
  'https://api.cohere.ai/v1/generate': 'generate',
  'https://api.cohere.ai/v1/embed': 'embed',
  'https://api.cohere.ai/v1/classify': 'classify',
  'https://api.cohere.ai/v1/summarize': 'summarize',
  'https://api.cohere.ai/v1/rerank': 'rerank',
  'https://api.cohere.ai/v2/rerank': 'rerank',
};

export const cohereTokenize = async (
  env: Record<string, any>,
  promptString: string,
  model?: string
) => {
  const maxChunkSize = 65000; // 65000 characters
  const options: Record<string, any> = {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      authorization: `Bearer ${Environment(env).COHERE_API_KEY}`,
      [PORTKEY_HEADER_KEYS.API_KEY]: Environment(env).PORTKEY_API_KEY,
      [PORTKEY_HEADER_KEYS.METADATA]: JSON.stringify({
        _user: 'winky_cohere_tokenizer',
      }),
      [PORTKEY_HEADER_KEYS.MODE]: 'proxy cohere',
      [PORTKEY_HEADER_KEYS.CACHE]: 'simple',
    },
    body: {
      text: promptString,
    },
  };

  if (model) {
    options.body.model = model;
  }
  options.body = JSON.stringify(options.body);

  if (promptString.length <= maxChunkSize) {
    const response = await externalServiceFetch(
      `${Environment(env).GATEWAY_BASEPATH}/tokenize`,

      options
    );
    const data: Record<string, any> = await response.json();
    return {
      status: 200,
      data: {
        token_count: data.tokens.length,
        token_strings: data.token_strings,
      },
    };
  } else {
    const aggregatedChunks: Record<string, any> = {
      token_count: 0,
      token_strings: [],
    };
    let startIndex = 0;

    while (startIndex < promptString.length) {
      const chunk = promptString.substring(
        startIndex,
        startIndex + maxChunkSize
      );
      startIndex += maxChunkSize;

      options.body = JSON.stringify({
        text: chunk,
      });

      const response = await externalServiceFetch(
        `${Environment(env).GATEWAY_BASEPATH}/tokenize`,

        options
      );
      const data: Record<string, any> = await response.json();
      aggregatedChunks.token_count += data.tokens.length;
      aggregatedChunks.token_strings.push(...data.token_strings);
    }

    return {
      status: 200,
      data: aggregatedChunks,
    };
  }
};

export const getCohereGenerateTokens = async (
  env: Record<string, any>,
  prompt: string,
  completions: Record<string, any>[],
  model: string
) => {
  const promptTokenizer = await cohereTokenize(env, prompt, model);
  const completionsTokenizer = await cohereTokenize(
    env,
    completions.join(' '),
    model
  );

  return {
    reqUnits: promptTokenizer.data.token_count,
    resUnits: completionsTokenizer.data.token_count,
  };
};

export const getCohereEmbedTokens = async (
  env: Record<string, any>,
  texts: string[],
  model: string
) => {
  const textTokenizer = await cohereTokenize(env, texts.join(' '), model);

  return {
    reqUnits: textTokenizer.data.token_count,
    resUnits: 0,
  };
};

export const getCohereClassificationTokens = async (
  inputs: Record<string, any>
) => {
  return {
    reqUnits: inputs.length,
    resUnits: 0,
  };
};

export const getCohereSummariseTokens = async (
  env: Record<string, any>,
  text: string,
  summary: string,
  model: string
) => {
  const textTokenizer = await cohereTokenize(env, text, model);
  const summaryTokenizer = await cohereTokenize(env, summary, model);
  return {
    reqUnits: textTokenizer.data.token_count,
    resUnits: summaryTokenizer.data.token_count,
  };
};

import type { Tiktoken } from 'js-tiktoken/lite';
import { logger } from '../apm';

// Lazy-loaded encoder - only initialized on first use to avoid memory limit in Workers
let _encoder: Tiktoken | null = null;
let _encoderPromise: Promise<Tiktoken> | null = null;

async function getEncoder(): Promise<Tiktoken> {
  if (_encoder) {
    return _encoder;
  }
  if (_encoderPromise) {
    return _encoderPromise;
  }
  _encoderPromise = (async () => {
    const [{ Tiktoken }, { default: o200k_base }] = await Promise.all([
      import('js-tiktoken/lite'),
      import('js-tiktoken/ranks/o200k_base'),
    ]);
    _encoder = new Tiktoken(o200k_base);
    return _encoder;
  })();
  return _encoderPromise;
}

export const aiProviderUrlModelMapping: Record<string, string> = {
  'https://api.cohere.ai/v1/generate': 'command',
  'https://api.cohere.ai/v1/embed': 'embed-english-v2.0',
  'https://api.cohere.ai/v1/classify': 'embed-english-v2.0',
  'https://api.cohere.ai/v1/summarize': 'summarize-xlarge',
  'https://api.cohere.ai/v1/tokenize': 'co-tokenize',
  'https://api.cohere.ai/v1/detokenize': 'co-detokenize',
  'https://api.cohere.ai/v1/detect-language': 'co-detect-language',
  'https://generativelanguage.googleapis.com/v1beta3/models/text-bison-001:generateText':
    'models/text-bison-001',
  'https://generativelanguage.googleapis.com/v1beta3/models/chat-bison-001:generateMessage':
    'models/chat-bison-001',
};

export function getFallbackModelName(provider: string, url: string) {
  return `fallback/${provider}/${new URL(url).pathname.split('/').pop()}`;
}

export function getDefaultModelName(
  reqBody: Record<string, any>,
  resBody: Record<string, any>
) {
  return reqBody.model || resBody.model;
}

async function getChatCompletionsTokenCount(input: Array<Record<string, any>>) {
  const encoder = await getEncoder();

  // OpenAI's official token counting approach for chat completions
  // Reference: https://github.com/openai/openai-cookbook/blob/main/examples/How_to_count_tokens_with_tiktoken.ipynb
  const TOKENS_PER_MESSAGE = 3; // Every message follows <|im_start|>{role}\n{content}<|im_end|>\n
  const TOKENS_PER_NAME = 1; // If there's a name, the role is omitted
  const REPLY_PRIMING_TOKENS = 3; // Every reply is primed with <|im_start|>assistant<|message|>

  let totalTokens = 0;

  for (const message of input) {
    totalTokens += TOKENS_PER_MESSAGE;

    // Count tokens for role
    if (message.role) {
      totalTokens += encoder.encode(message.role).length;
    }

    // Count tokens for content
    if (message.content) {
      if (typeof message.content === 'string') {
        totalTokens += encoder.encode(message.content).length;
      } else if (Array.isArray(message.content)) {
        // Handle multimodal content (array of content parts)
        for (const part of message.content) {
          if (part.type === 'text' && part.text) {
            totalTokens += encoder.encode(part.text).length;
          } else if (part.type === 'image_url') {
            // Image tokens are calculated differently by OpenAI
            // For now, we'll skip image token counting as it requires image analysis
            // Images typically cost 85-170 tokens for low detail, 85 + 170*tiles for high detail
          }
        }
      }
    }

    // Count tokens for name field
    if (message.name) {
      totalTokens += TOKENS_PER_NAME;
      totalTokens += encoder.encode(message.name).length;
    }
  }

  // Add tokens for reply priming
  totalTokens += REPLY_PRIMING_TOKENS;

  return {
    units: totalTokens,
  };
}

// eslint-disable-next-line no-unused-vars
async function getCompletionsTokenCount(input: Array<string>) {
  const encoder = await getEncoder();
  let inputTokens = 0;
  for (const i of input) {
    inputTokens += encoder.encode(i).length;
  }

  return {
    units: inputTokens,
  };
}

export const getTokens = async function (
  body: Array<string | Record<string, any>>
) {
  if (!body?.length) {
    return {
      units: 0,
    };
  }

  let modelType;

  if (typeof body[0] === 'string') {
    modelType = 'text';
  } else if (typeof body[0] === 'object') {
    modelType = 'chat';
  }

  let response = {
    units: 0,
  };

  switch (modelType) {
    case 'text': {
      response = await getCompletionsTokenCount(body as string[]);
      break;
    }

    case 'chat': {
      response = await getChatCompletionsTokenCount(
        body as Array<Record<string, any>>
      );
      break;
    }
    default:
      break;
  }

  return response;
};

export const openaiTokenize = async (input: any) => {
  try {
    const tokens = await getTokens(input);
    return {
      data: tokens,
    };
  } catch (error) {
    logger.error('Error tokenizing input', error);
    return {
      data: { units: 0 },
    };
  }
};

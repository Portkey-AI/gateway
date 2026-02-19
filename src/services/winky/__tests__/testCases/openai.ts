import { TestCase } from '../types';

export const OPENAI_TEST_CASES: TestCase[] = [
  {
    provider: 'openai',
    model: 'gpt-4o-latest',
    description: 'standard text completion',
    tokens: {
      reqUnits: 1000,
      resUnits: 1000,
      cacheReadInputUnits: 0,
      cacheWriteInputUnits: 0,
      cacheReadAudioInputUnits: 0,
      resAudioUnits: 0,
      resTextUnits: 1000,
      reqAudioUnits: 0,
      reqTextUnits: 1000,
      additionalUnits: {
        web_search: 0,
      },
    },
    requestBody: {},
    expected: {
      requestCost: 0.5, // 0.0005 cents per token * 1000
      responseCost: 1.5, // 0.0015 cents per token * 1000
      currency: 'USD',
    },
  },
  {
    provider: 'openai',
    model: 'gpt-4-turbo-preview',
    description: 'standard text completion',
    tokens: {
      reqUnits: 1000,
      resUnits: 1000,
      cacheReadInputUnits: 0,
      cacheWriteInputUnits: 0,
      cacheReadAudioInputUnits: 0,
      resAudioUnits: 0,
      resTextUnits: 1000,
      reqAudioUnits: 0,
      reqTextUnits: 1000,
      additionalUnits: {
        web_search: 0,
      },
    },
    requestBody: {},
    expected: {
      requestCost: 1.0, // 0.001 cents per token * 1000
      responseCost: 3.0, // 0.003 cents per token * 1000
      currency: 'USD',
    },
  },
  {
    provider: 'openai',
    model: 'gpt-4-turbo-2024-04-09',
    description: 'standard text completion',
    tokens: {
      reqUnits: 1000,
      resUnits: 1000,
      cacheReadInputUnits: 0,
      cacheWriteInputUnits: 0,
      cacheReadAudioInputUnits: 0,
      resAudioUnits: 0,
      resTextUnits: 1000,
      reqAudioUnits: 0,
      reqTextUnits: 1000,
      additionalUnits: {
        web_search: 0,
      },
    },
    requestBody: {},
    expected: {
      requestCost: 1.0, // 0.001 cents per token * 1000
      responseCost: 3.0, // 0.003 cents per token * 1000
      currency: 'USD',
    },
  },
  {
    provider: 'openai',
    model: 'gpt-4',
    description: 'standard text completion',
    tokens: {
      reqUnits: 1000,
      resUnits: 1000,
      cacheReadInputUnits: 0,
      cacheWriteInputUnits: 0,
      cacheReadAudioInputUnits: 0,
      resAudioUnits: 0,
      resTextUnits: 1000,
      reqAudioUnits: 0,
      reqTextUnits: 1000,
      additionalUnits: {
        web_search: 0,
      },
    },
    requestBody: {},
    expected: {
      requestCost: 3.0, // 0.003 cents per token * 1000
      responseCost: 6.0, // 0.006 cents per token * 1000
      currency: 'USD',
    },
  },
  {
    provider: 'openai',
    model: 'gpt-4-32k',
    description: 'standard text completion',
    tokens: {
      reqUnits: 1000,
      resUnits: 1000,
      cacheReadInputUnits: 0,
      cacheWriteInputUnits: 0,
      cacheReadAudioInputUnits: 0,
      resAudioUnits: 0,
      resTextUnits: 1000,
      reqAudioUnits: 0,
      reqTextUnits: 1000,
      additionalUnits: {
        web_search: 0,
      },
    },
    requestBody: {},
    expected: {
      requestCost: 6.0, // 0.006 cents per token * 1000
      responseCost: 12.0, // 0.012 cents per token * 1000
      currency: 'USD',
    },
  },
  {
    provider: 'openai',
    model: 'gpt-4-0125-preview',
    description: 'standard text completion',
    tokens: {
      reqUnits: 1000,
      resUnits: 1000,
      cacheReadInputUnits: 0,
      cacheWriteInputUnits: 0,
      cacheReadAudioInputUnits: 0,
      resAudioUnits: 0,
      resTextUnits: 1000,
      reqAudioUnits: 0,
      reqTextUnits: 1000,
      additionalUnits: {
        web_search: 0,
      },
    },
    requestBody: {},
    expected: {
      requestCost: 1.0, // 0.001 cents per token * 1000
      responseCost: 3.0, // 0.003 cents per token * 1000
      currency: 'USD',
    },
  },
  {
    provider: 'openai',
    model: 'gpt-3.5-turbo-0125',
    description: 'standard text completion',
    tokens: {
      reqUnits: 1000,
      resUnits: 1000,
      cacheReadInputUnits: 0,
      cacheWriteInputUnits: 0,
      cacheReadAudioInputUnits: 0,
      resAudioUnits: 0,
      resTextUnits: 1000,
      reqAudioUnits: 0,
      reqTextUnits: 1000,
      additionalUnits: {
        web_search: 0,
      },
    },
    requestBody: {},
    expected: {
      requestCost: 0.05, // 0.00005 cents per token * 1000
      responseCost: 0.15, // 0.00015 cents per token * 1000
      currency: 'USD',
    },
  },
  {
    provider: 'openai',
    model: 'gpt-3.5-turbo-instruct',
    description: 'standard text completion',
    tokens: {
      reqUnits: 1000,
      resUnits: 1000,
      cacheReadInputUnits: 0,
      cacheWriteInputUnits: 0,
      cacheReadAudioInputUnits: 0,
      resAudioUnits: 0,
      resTextUnits: 1000,
      reqAudioUnits: 0,
      reqTextUnits: 1000,
      additionalUnits: {
        web_search: 0,
      },
    },
    requestBody: {},
    expected: {
      requestCost: 0.15, // 0.00015 cents per token * 1000
      responseCost: 0.2, // 0.0002 cents per token * 1000
      currency: 'USD',
    },
  },
  {
    provider: 'openai',
    model: 'gpt-3.5-turbo-1106',
    description: 'standard text completion',
    tokens: {
      reqUnits: 1000,
      resUnits: 1000,
      cacheReadInputUnits: 0,
      cacheWriteInputUnits: 0,
      cacheReadAudioInputUnits: 0,
      resAudioUnits: 0,
      resTextUnits: 1000,
      reqAudioUnits: 0,
      reqTextUnits: 1000,
      additionalUnits: {
        web_search: 0,
      },
    },
    requestBody: {},
    expected: {
      requestCost: 0.1, // 0.0001 cents per token * 1000
      responseCost: 0.2, // 0.0002 cents per token * 1000
      currency: 'USD',
    },
  },
  {
    provider: 'openai',
    model: 'gpt-3.5-turbo-0613',
    description: 'standard text completion',
    tokens: {
      reqUnits: 1000,
      resUnits: 1000,
      cacheReadInputUnits: 0,
      cacheWriteInputUnits: 0,
      cacheReadAudioInputUnits: 0,
      resAudioUnits: 0,
      resTextUnits: 1000,
      reqAudioUnits: 0,
      reqTextUnits: 1000,
      additionalUnits: {
        web_search: 0,
      },
    },
    requestBody: {},
    expected: {
      requestCost: 0.15, // 0.00015 cents per token * 1000
      responseCost: 0.2, // 0.0002 cents per token * 1000
      currency: 'USD',
    },
  },
  {
    provider: 'openai',
    model: 'gpt-3.5-turbo-16k-0613',
    description: 'standard text completion',
    tokens: {
      reqUnits: 1000,
      resUnits: 1000,
      cacheReadInputUnits: 0,
      cacheWriteInputUnits: 0,
      cacheReadAudioInputUnits: 0,
      resAudioUnits: 0,
      resTextUnits: 1000,
      reqAudioUnits: 0,
      reqTextUnits: 1000,
      additionalUnits: {
        web_search: 0,
      },
    },
    requestBody: {},
    expected: {
      requestCost: 0.3, // 0.0003 cents per token * 1000
      responseCost: 0.4, // 0.0004 cents per token * 1000
      currency: 'USD',
    },
  },
  // {
  //   provider: 'openai',
  //   model: 'gpt-4o-audio-preview',
  //   description: 'audio processing',
  //   input: { tokens: 1000, type: 'audio' },
  //   output: { tokens: 1000, type: 'audio' },
  //   expected: {
  //     requestCost: 10.25, // (0.00025 * 1000) + (0.01 * 1000)
  //     responseCost: 21.0, // (0.001 * 1000) + (0.02 * 1000)
  //     currency: 'USD',
  //   },
  // },
  // {
  //   provider: 'openai',
  //   model: 'gpt-4o-audio-preview',
  //   description: 'text only',
  //   input: { tokens: 1000, type: 'text' },
  //   output: { tokens: 1000, type: 'text' },
  //   expected: {
  //     requestCost: 0.25, // 0.00025 cents per token * 1000
  //     responseCost: 1.0, // 0.001 cents per token * 1000
  //     currency: 'USD',
  //   },
  // },
  {
    provider: 'openai',
    model: 'gpt-4o-2024-05-13',
    description: 'standard text completion',
    tokens: {
      reqUnits: 1000,
      resUnits: 1000,
      cacheReadInputUnits: 0,
      cacheWriteInputUnits: 0,
      cacheReadAudioInputUnits: 0,
      resAudioUnits: 0,
      resTextUnits: 1000,
      reqAudioUnits: 0,
      reqTextUnits: 1000,
      additionalUnits: {
        web_search: 0,
      },
    },
    requestBody: {},
    expected: {
      requestCost: 0.5, // 0.0005 cents per token * 1000
      responseCost: 1.5, // 0.0015 cents per token * 1000
      currency: 'USD',
    },
  },
  {
    provider: 'openai',
    model: 'gpt-4o-mini',
    description: 'standard text completion',
    tokens: {
      reqUnits: 1000,
      resUnits: 1000,
      cacheReadInputUnits: 0,
      cacheWriteInputUnits: 0,
      cacheReadAudioInputUnits: 0,
      resAudioUnits: 0,
      resTextUnits: 1000,
      reqAudioUnits: 0,
      reqTextUnits: 1000,
      additionalUnits: {
        web_search: 0,
      },
    },
    requestBody: {},
    expected: {
      requestCost: 0.015, // 0.000015 cents per token * 1000
      responseCost: 0.06, // 0.00006 cents per token * 1000
      currency: 'USD',
    },
  },
  {
    provider: 'openai',
    model: 'gpt-4o-mini-2024-07-18',
    description: 'standard text completion',
    tokens: {
      reqUnits: 1000,
      resUnits: 1000,
      cacheReadInputUnits: 0,
      cacheWriteInputUnits: 0,
      cacheReadAudioInputUnits: 0,
      resAudioUnits: 0,
      resTextUnits: 1000,
      reqAudioUnits: 0,
      reqTextUnits: 1000,
      additionalUnits: {
        web_search: 0,
      },
    },
    requestBody: {},
    expected: {
      requestCost: 0.015, // 0.000015 cents per token * 1000
      responseCost: 0.06, // 0.00006 cents per token * 1000
      currency: 'USD',
    },
  },
  {
    provider: 'openai',
    model: 'text-embedding-3-small',
    description: 'standard embedding',
    tokens: {
      reqUnits: 1000,
      resUnits: 0,
      cacheReadInputUnits: 0,
      cacheWriteInputUnits: 0,
      cacheReadAudioInputUnits: 0,
      resAudioUnits: 0,
      resTextUnits: 0,
      reqAudioUnits: 0,
      reqTextUnits: 1000,
      additionalUnits: {
        web_search: 0,
      },
    },
    requestBody: {},
    expected: {
      requestCost: 0.002, // 0.000002 cents per token * 1000
      responseCost: 0, // no response cost for embeddings
      currency: 'USD',
    },
  },
  {
    provider: 'openai',
    model: 'text-embedding-3-large',
    description: 'standard embedding',
    tokens: {
      reqUnits: 1000,
      resUnits: 0,
      cacheReadInputUnits: 0,
      cacheWriteInputUnits: 0,
      cacheReadAudioInputUnits: 0,
      resAudioUnits: 0,
      resTextUnits: 0,
      reqAudioUnits: 0,
      reqTextUnits: 1000,
      additionalUnits: {
        web_search: 0,
      },
    },
    requestBody: {},
    expected: {
      requestCost: 0.013, // 0.000013 cents per token * 1000
      responseCost: 0, // no response cost for embeddings
      currency: 'USD',
    },
  },
  {
    provider: 'openai',
    model: 'ada-v2',
    description: 'standard embedding',
    tokens: {
      reqUnits: 1000,
      resUnits: 0,
      cacheReadInputUnits: 0,
      cacheWriteInputUnits: 0,
      cacheReadAudioInputUnits: 0,
      resAudioUnits: 0,
      resTextUnits: 0,
      reqAudioUnits: 0,
      reqTextUnits: 1000,
      additionalUnits: {
        web_search: 0,
      },
    },
    requestBody: {},
    expected: {
      requestCost: 0.01, // 0.00001 cents per token * 1000
      responseCost: 0, // no response cost for embeddings
      currency: 'USD',
    },
  },
  {
    provider: 'openai',
    model: 'gpt-4o-realtime-preview',
    description: 'text processing',
    tokens: {
      reqUnits: 1000,
      resUnits: 1000,
      cacheReadInputUnits: 0,
      cacheWriteInputUnits: 0,
      cacheReadAudioInputUnits: 0,
      resAudioUnits: 0,
      resTextUnits: 1000,
      reqAudioUnits: 0,
      reqTextUnits: 1000,
      additionalUnits: {
        web_search: 0,
      },
    },
    requestBody: {},
    expected: {
      requestCost: 0.5, // $5.00/1M = 0.0005 cents per token * 1000
      responseCost: 2.0, // $20.00/1M = 0.002 cents per token * 1000
      currency: 'USD',
    },
  },
  {
    provider: 'openai',
    model: 'gpt-4o-realtime-preview',
    description: 'text with cache read',
    tokens: {
      reqUnits: 1000,
      resUnits: 1000,
      cacheReadInputUnits: 500,
      cacheWriteInputUnits: 0,
      cacheReadAudioInputUnits: 0,
      resAudioUnits: 0,
      resTextUnits: 1000,
      reqAudioUnits: 0,
      reqTextUnits: 1000,
      additionalUnits: {
        web_search: 0,
      },
    },
    requestBody: {},
    expected: {
      requestCost: 0.375, // (0.0005 * 500) + (0.00025 * 500)
      responseCost: 2.0, // 0.002 * 1000
      currency: 'USD',
    },
  },
  {
    provider: 'openai',
    model: 'gpt-4o-realtime-preview',
    description: 'audio processing',
    tokens: {
      reqUnits: 2000,
      resUnits: 2000,
      cacheReadInputUnits: 0,
      cacheWriteInputUnits: 0,
      cacheReadAudioInputUnits: 0,
      resAudioUnits: 1000,
      resTextUnits: 1000,
      reqAudioUnits: 1000,
      reqTextUnits: 1000,
      additionalUnits: {
        web_search: 0,
      },
    },
    requestBody: {},
    expected: {
      requestCost: 10.5, // (0.0005 * 1000) + (0.01 * 1000)
      responseCost: 22.0, // (0.002 * 1000) + (0.02 * 1000)
      currency: 'USD',
    },
  },
  {
    provider: 'openai',
    model: 'gpt-4o-realtime-preview',
    description: 'audio with cache read',
    tokens: {
      reqUnits: 1500,
      resUnits: 2000,
      cacheReadInputUnits: 500,
      cacheWriteInputUnits: 0,
      cacheReadAudioInputUnits: 0,
      resAudioUnits: 1000,
      resTextUnits: 1000,
      reqAudioUnits: 500,
      reqTextUnits: 1000,
      additionalUnits: {
        web_search: 0,
      },
    },
    requestBody: {},
    expected: {
      requestCost: 5.375, // (0.0005 * 500) + (0.00025 * 500) + (0.01 * 500)
      responseCost: 22.0, // (0.002 * 1000) + (0.02 * 1000)
      currency: 'USD',
    },
  },
  {
    provider: 'openai',
    model: 'gpt-4o-realtime-preview-2024-10-01',
    description: 'text processing',
    tokens: {
      reqUnits: 1000,
      resUnits: 1000,
      cacheReadInputUnits: 0,
      cacheWriteInputUnits: 0,
      cacheReadAudioInputUnits: 0,
      resAudioUnits: 0,
      resTextUnits: 1000,
      reqAudioUnits: 0,
      reqTextUnits: 1000,
      additionalUnits: {
        web_search: 0,
      },
    },
    requestBody: {},
    expected: {
      requestCost: 0.5, // $5.00/1M = 0.0005 cents per token * 1000
      responseCost: 2.0, // $20.00/1M = 0.002 cents per token * 1000
      currency: 'USD',
    },
  },
  {
    provider: 'openai',
    model: 'gpt-4o-realtime-preview-2024-10-01',
    description: 'text with cache read',
    tokens: {
      reqUnits: 1000,
      resUnits: 1000,
      cacheReadInputUnits: 500,
      cacheWriteInputUnits: 0,
      cacheReadAudioInputUnits: 0,
      resAudioUnits: 0,
      resTextUnits: 1000,
      reqAudioUnits: 0,
      reqTextUnits: 1000,
      additionalUnits: {
        web_search: 0,
      },
    },
    requestBody: {},
    expected: {
      requestCost: 0.375, // (0.0005 * 500) + (0.00025 * 500)
      responseCost: 2.0, // 0.002 * 1000
      currency: 'USD',
    },
  },
  {
    provider: 'openai',
    model: 'gpt-4o-realtime-preview-2024-10-01',
    description: 'audio processing',
    tokens: {
      reqUnits: 2000,
      resUnits: 2000,
      cacheReadInputUnits: 0,
      cacheWriteInputUnits: 0,
      cacheReadAudioInputUnits: 0,
      resAudioUnits: 1000,
      resTextUnits: 1000,
      reqAudioUnits: 1000,
      reqTextUnits: 1000,
      additionalUnits: {
        web_search: 0,
      },
    },
    requestBody: {},
    expected: {
      requestCost: 10.5, // (0.0005 * 1000) + (0.01 * 1000)
      responseCost: 22.0, // (0.002 * 1000) + (0.02 * 1000)
      currency: 'USD',
    },
  },
  {
    provider: 'openai',
    model: 'gpt-4o-realtime-preview-2024-10-01',
    description: 'audio with cache read',
    tokens: {
      reqUnits: 1500,
      resUnits: 2000,
      cacheReadInputUnits: 500,
      cacheWriteInputUnits: 0,
      cacheReadAudioInputUnits: 0,
      resAudioUnits: 1000,
      resTextUnits: 1000,
      reqAudioUnits: 500,
      reqTextUnits: 1000,
      additionalUnits: {
        web_search: 0,
      },
    },
    requestBody: {},
    expected: {
      requestCost: 5.375, // (0.0005 * 500) + (0.00025 * 500) + (0.01 * 500)
      responseCost: 22.0, // (0.002 * 1000) + (0.02 * 1000)
      currency: 'USD',
    },
  },
  {
    provider: 'openai',
    model: 'dall-e-3',
    description: 'standard quality 1024x1024',
    tokens: {
      reqUnits: 0,
      resUnits: 1,
    },
    requestBody: {
      quality: 'standard',
      size: '1024x1024',
    },
    expected: {
      requestCost: 0,
      responseCost: 4.0, // $0.040 per image
      currency: 'USD',
    },
  },
  {
    provider: 'openai',
    model: 'dall-e-3',
    description: 'standard quality 1024x1792',
    tokens: {
      reqUnits: 0,
      resUnits: 1,
    },
    requestBody: {
      quality: 'standard',
      size: '1024x1792',
    },
    expected: {
      requestCost: 0,
      responseCost: 8.0, // $0.080 per image
      currency: 'USD',
    },
  },
  {
    provider: 'openai',
    model: 'dall-e-3',
    description: 'HD quality 1024x1024',
    tokens: {
      reqUnits: 0,
      resUnits: 1,
    },
    requestBody: {
      quality: 'hd',
      size: '1024x1024',
    },
    expected: {
      requestCost: 0,
      responseCost: 8.0, // $0.080 per image
      currency: 'USD',
    },
  },
  {
    provider: 'openai',
    model: 'dall-e-3',
    description: 'HD quality 1024x1792',
    tokens: {
      reqUnits: 0,
      resUnits: 1,
    },
    requestBody: {
      quality: 'hd',
      size: '1024x1792',
    },
    expected: {
      requestCost: 0,
      responseCost: 12.0, // $0.120 per image
      currency: 'USD',
    },
  },
  {
    provider: 'openai',
    model: 'dall-e-2',
    description: 'standard 1024x1024',
    tokens: {
      reqUnits: 0,
      resUnits: 1,
    },
    requestBody: {
      quality: 'standard',
      size: '1024x1024',
    },
    expected: {
      requestCost: 0,
      responseCost: 2.0, // $0.020 per image
      currency: 'USD',
    },
  },
  {
    provider: 'openai',
    model: 'dall-e-2',
    description: 'standard 512x512',
    tokens: {
      reqUnits: 0,
      resUnits: 1,
    },
    requestBody: {
      quality: 'standard',
      size: '512x512',
    },
    expected: {
      requestCost: 0,
      responseCost: 1.8, // $0.018 per image
      currency: 'USD',
    },
  },
  {
    provider: 'openai',
    model: 'dall-e-2',
    description: 'standard 256x256',
    tokens: {
      reqUnits: 0,
      resUnits: 1,
    },
    requestBody: {
      quality: 'standard',
      size: '256x256',
    },
    expected: {
      requestCost: 0,
      responseCost: 1.6, // $0.016 per image
      currency: 'USD',
    },
  },
  // =============================================================================
  // gpt-image-1.5 image edit (Images Edits API - token + per-image pricing)
  // Ref: https://platform.openai.com/docs/pricing (Image generation / Image tokens)
  // =============================================================================
  {
    provider: 'openai',
    model: 'gpt-image-1.5',
    description: 'image edit - low quality 1024x1024 (per-image only)',
    tokens: {
      reqUnits: 0,
      resUnits: 0,
      cacheReadInputUnits: 0,
      cacheWriteInputUnits: 0,
      reqImageUnits: 0,
      resImageUnits: 0,
      reqTextUnits: 0,
      resTextUnits: 0,
      cachedImageUnits: 0,
      cachedTextUnits: 0,
    },
    requestBody: {
      quality: 'low',
      size: '1024x1024',
    },
    expected: {
      requestCost: 0,
      responseCost: 0.9, // $0.009 per image (low 1024x1024)
      currency: 'USD',
    },
  },
  {
    provider: 'openai',
    model: 'gpt-image-1.5',
    description: 'image edit - medium quality 1024x1024 (per-image only)',
    tokens: {
      reqUnits: 0,
      resUnits: 0,
      cacheReadInputUnits: 0,
      cacheWriteInputUnits: 0,
      reqImageUnits: 0,
      resImageUnits: 0,
      reqTextUnits: 0,
      resTextUnits: 0,
      cachedImageUnits: 0,
      cachedTextUnits: 0,
    },
    requestBody: {
      quality: 'medium',
      size: '1024x1024',
    },
    expected: {
      requestCost: 0,
      responseCost: 3.4, // $0.034 per image (medium 1024x1024)
      currency: 'USD',
    },
  },
  {
    provider: 'openai',
    model: 'gpt-image-1.5',
    description: 'image edit - default quality 1024x1024 (per-image only)',
    tokens: {
      reqUnits: 239,
      resUnits: 4518,
      cacheReadInputUnits: 0,
      cacheWriteInputUnits: 0,
      reqImageUnits: 194,
      resImageUnits: 0,
      reqTextUnits: 45,
      resTextUnits: 358,
      cachedImageUnits: 0,
      cachedTextUnits: 0,
    },
    requestBody: {
      quality: 'default',
      size: '1024x1024',
    },
    expected: {
      requestCost: 0.1777,
      responseCost: 13.658, // $0.133 per image (default 1024x1024)
      currency: 'USD',
    },
  },
  {
    provider: 'openai',
    model: 'gpt-image-1.5',
    description: 'image edit - high quality 1024x1536 (per-image only)',
    tokens: {
      reqUnits: 0,
      resUnits: 0,
      cacheReadInputUnits: 0,
      cacheWriteInputUnits: 0,
      reqImageUnits: 0,
      resImageUnits: 0,
      reqTextUnits: 0,
      resTextUnits: 0,
      cachedImageUnits: 0,
      cachedTextUnits: 0,
    },
    requestBody: {
      quality: 'high',
      size: '1024x1536',
    },
    expected: {
      requestCost: 0,
      responseCost: 20, // $0.20 per image (high 1024x1536)
      currency: 'USD',
    },
  },
  {
    provider: 'openai',
    model: 'gpt-image-1.5',
    description: 'image edit - with input/output tokens (image + text tokens)',
    tokens: {
      reqUnits: 0,
      resUnits: 0,
      cacheReadInputUnits: 0,
      cacheWriteInputUnits: 0,
      reqImageUnits: 1000,
      resImageUnits: 0,
      reqTextUnits: 500,
      resTextUnits: 100,
      cachedImageUnits: 0,
      cachedTextUnits: 0,
    },
    requestBody: {
      quality: 'medium',
      size: '1024x1024',
    },
    expected: {
      // request: 1000 * 0.0008 (image) + 500 * 0.0005 (text) = 0.8 + 0.25 = 1.05
      requestCost: 1.05,
      // response: 3.4 (per image) + 100 * 0.001 (text) = 3.4 + 0.1 = 3.5
      responseCost: 3.5,
      currency: 'USD',
    },
  },
  {
    provider: 'openai',
    model: 'gpt-image-1.5',
    description: 'image edit - with cached input tokens',
    tokens: {
      reqUnits: 0,
      resUnits: 0,
      cacheReadInputUnits: 0,
      cacheWriteInputUnits: 0,
      reqImageUnits: 500,
      resImageUnits: 0,
      reqTextUnits: 200,
      resTextUnits: 50,
      cachedImageUnits: 300,
      cachedTextUnits: 100,
    },
    requestBody: {
      quality: 'low',
      size: '1536x1024',
    },
    expected: {
      // request: 500*0.0008 + 200*0.0005 + 300*0.0002 + 100*0.000125 = 0.4 + 0.1 + 0.06 + 0.0125 = 0.5725
      requestCost: 0.5725,
      // response: 1.3 (low 1536x1024) + 50*0.001 = 1.3 + 0.05 = 1.35
      responseCost: 1.35,
      currency: 'USD',
    },
  },
  // {
  //   provider: 'openai',
  //   model: 'whisper-1',
  //   description: 'audio transcription',
  //   input: {
  //     tokens: 60, // 60 seconds = 1 minute
  //     type: 'audio',
  //   },
  //   output: { tokens: 0, type: 'text' },
  //   expected: {
  //     requestCost: 0.36, // $0.006 per second * 60 seconds
  //     responseCost: 0,
  //     currency: 'USD',
  //   },
  // },
  {
    provider: 'openai',
    model: 'tts-1',
    description: 'text to speech',
    tokens: {
      reqUnits: 1000, // 1000 characters
      resUnits: 0,
      cacheReadInputUnits: 0,
      cacheWriteInputUnits: 0,
      cacheReadAudioInputUnits: 0,
      resAudioUnits: 0,
      resTextUnits: 0,
      reqAudioUnits: 0,
      reqTextUnits: 0,
      additionalUnits: {
        web_search: 0,
      },
    },
    requestBody: {},
    expected: {
      requestCost: 1.5, // $15.00/1M = 0.0015 cents per character * 1000
      responseCost: 0,
      currency: 'USD',
    },
  },
  {
    provider: 'openai',
    model: 'tts-1-hd',
    description: 'text to speech HD',
    tokens: {
      reqUnits: 1000, // 1000 characters
      resUnits: 0,
      cacheReadInputUnits: 0,
      cacheWriteInputUnits: 0,
      cacheReadAudioInputUnits: 0,
      resAudioUnits: 0,
      resTextUnits: 0,
      reqAudioUnits: 0,
      reqTextUnits: 0,
      additionalUnits: {
        web_search: 0,
      },
    },
    requestBody: {},
    expected: {
      requestCost: 3.0, // $30.00/1M = 0.003 cents per character * 1000
      responseCost: 0,
      currency: 'USD',
    },
  },
];

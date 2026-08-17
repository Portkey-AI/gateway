import {
  recursivelyDeleteUnsupportedParameters,
  transformGeminiToolParameters,
} from './utils';
import { GoogleEmbedParams } from './embed';
import { EmbedInstancesData, PortkeyGeminiParams } from './types';

/**
 * Vertex exposes two mutually exclusive thinking controls:
 *
 * - `thinkingLevel` (MINIMAL/LOW/MEDIUM/HIGH) - Gemini 3 and newer only.
 * - `thinkingBudget` (integer token budget) - Gemini 2.5 family. `-1` means
 *   "dynamic", i.e. let the model decide how much to think.
 *
 * @see https://cloud.google.com/vertex-ai/generative-ai/docs/thinking
 *
 * Sending `thinkingLevel` to a Gemini 2.5 model is silently ignored server-side.
 * That is invisible on most Gemini 2.5 variants because they default to
 * thinking-on, but `gemini-2.5-flash-lite` defaults to a thinking budget of 0,
 * so `reasoning_effort` there produced no thinking at all and no error.
 */
const GEMINI_2_5_THINKING_BUDGETS: Record<string, number> = {
  minimal: 512,
  low: 1024,
  medium: 8192,
  high: 24576,
};

const supportsThinkingLevel = (model?: string): boolean => {
  if (!model) return true;
  // Model ids reach this transform either bare (`gemini-2.5-flash`) or
  // provider-prefixed (`google.gemini-2.5-flash`).
  return !/gemini-2\.5/.test(model);
};

export const getThinkingConfigForReasoningEffort = (
  reasoningEffort: string,
  model?: string
): Record<string, any> | undefined => {
  if (supportsThinkingLevel(model)) {
    return { thinkingLevel: reasoningEffort };
  }
  const thinkingBudget = GEMINI_2_5_THINKING_BUDGETS[reasoningEffort];
  if (thinkingBudget === undefined) return undefined;
  return { thinkingBudget };
};

/**
 * @see https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/gemini#request_body
 */
export function transformGenerationConfig(params: PortkeyGeminiParams) {
  const generationConfig: Record<string, any> = {};
  if (params['temperature'] != null && params['temperature'] != undefined) {
    generationConfig['temperature'] = params['temperature'];
  }
  if (params['top_p'] != null && params['top_p'] != undefined) {
    generationConfig['topP'] = params['top_p'];
  }
  if (params['top_k'] != null && params['top_k'] != undefined) {
    generationConfig['topK'] = params['top_k'];
  }
  if (params['max_tokens'] != null && params['max_tokens'] != undefined) {
    generationConfig['maxOutputTokens'] = params['max_tokens'];
  }
  if (
    params['max_completion_tokens'] != null &&
    params['max_completion_tokens'] != undefined
  ) {
    generationConfig['maxOutputTokens'] = params['max_completion_tokens'];
  }
  if (params['stop']) {
    generationConfig['stopSequences'] = params['stop'];
  }
  if (params?.response_format?.type === 'json_object') {
    generationConfig['responseMimeType'] = 'application/json';
  }
  if (params['logprobs']) {
    generationConfig['responseLogprobs'] = params['logprobs'];
  }
  if (params['top_logprobs'] != null && params['top_logprobs'] != undefined) {
    generationConfig['logprobs'] = params['top_logprobs']; // range 1-5, openai supports 1-20
  }
  if (params['seed'] != null && params['seed'] != undefined) {
    generationConfig['seed'] = params['seed'];
  }
  if (params?.response_format?.type === 'json_schema') {
    generationConfig['responseMimeType'] = 'application/json';
    let schema =
      params?.response_format?.json_schema?.schema ??
      params?.response_format?.json_schema;
    recursivelyDeleteUnsupportedParameters(schema);
    generationConfig['responseSchema'] = transformGeminiToolParameters(schema);
  }

  if (params?.thinking) {
    const { budget_tokens, type } = params.thinking;
    const thinkingConfig: Record<string, any> = {};
    thinkingConfig['include_thoughts'] =
      type === 'enabled' && budget_tokens ? true : false;
    thinkingConfig['thinking_budget'] = budget_tokens;
    generationConfig['thinking_config'] = thinkingConfig;
  }
  if (params.modalities) {
    generationConfig['responseModalities'] = params.modalities.map((modality) =>
      modality.toUpperCase()
    );
  }
  if (params.reasoning_effort && params.reasoning_effort !== 'none') {
    const thinkingConfig = getThinkingConfigForReasoningEffort(
      params.reasoning_effort,
      params.model
    );
    if (thinkingConfig) {
      generationConfig['thinkingConfig'] = thinkingConfig;
    }
  }
  if (params.image_config) {
    generationConfig['imageConfig'] = {
      ...(params.image_config.aspect_ratio && {
        aspectRatio: params.image_config.aspect_ratio,
      }),
      ...(params.image_config.image_size && {
        imageSize: params.image_config.image_size,
      }),
    };
  }
  return generationConfig;
}

export function transformEmbeddingsParameters(params: GoogleEmbedParams) {
  let embeddingsParameters: Record<string, any> = {};
  if (params['parameters'] && typeof params['parameters'] === 'object') {
    embeddingsParameters = { ...params['parameters'] };
  }
  if (params['dimensions']) {
    // for multimodal embeddings, the parameter is dimension
    if (Array.isArray(params.input) && typeof params.input[0] === 'object') {
      embeddingsParameters['dimension'] = params['dimensions'];
    } else {
      embeddingsParameters['outputDimensionality'] = params['dimensions'];
    }
  }

  return embeddingsParameters;
}

export function transformEmbeddingInputs(params: GoogleEmbedParams) {
  const instances: EmbedInstancesData[] = [];
  if (Array.isArray(params.input)) {
    params.input.forEach((input) => {
      if (typeof input === 'string') {
        instances.push({
          content: input,
          task_type: params.task_type,
        });
      } else if (typeof input === 'object') {
        instances.push({
          text: input.text,
          ...(input.image && {
            image: {
              gcsUri: input.image.url,
              bytesBase64Encoded: input.image.base64,
            },
          }),
          ...(input.video && {
            video: {
              gcsUri: input.video.url,
              bytesBase64Encoded: input.video.base64,
              videoSegmentConfig: {
                startOffsetSec: input.video.start_offset,
                endOffsetSec: input.video.end_offset,
                intervalSec: input.video.interval,
              },
            },
          }),
        });
      }
    });
  } else {
    instances.push({
      content: params.input,
      task_type: params.task_type,
    });
  }
  return instances;
}

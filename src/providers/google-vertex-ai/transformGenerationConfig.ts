import { Params } from '../../types/requestBody';
import { derefer, recursivelyDeleteUnsupportedParameters } from './utils';
import { GoogleEmbedParams } from './embed';
import { EmbedInstancesData } from './types';
/**
 * @see https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/gemini#request_body
 */
export function transformGenerationConfig(params: Params) {
  const generationConfig: Record<string, any> = {};
  if (params['temperature']) {
    generationConfig['temperature'] = params['temperature'];
  }
  if (params['top_p']) {
    generationConfig['topP'] = params['top_p'];
  }
  if (params['top_k']) {
    generationConfig['topK'] = params['top_k'];
  }
  if (params['max_tokens']) {
    generationConfig['maxOutputTokens'] = params['max_tokens'];
  }
  if (params['max_completion_tokens']) {
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
  if (params['top_logprobs']) {
    generationConfig['logprobs'] = params['top_logprobs']; // range 1-5, openai supports 1-20
  }
  if (params?.response_format?.type === 'json_schema') {
    generationConfig['responseMimeType'] = 'application/json';
    recursivelyDeleteUnsupportedParameters(
      params?.response_format?.json_schema?.schema
    );
    let schema =
      params?.response_format?.json_schema?.schema ??
      params?.response_format?.json_schema;
    if (Object.keys(schema).includes('$defs')) {
      schema = derefer(schema);
      delete schema['$defs'];
    }
    if (Object.hasOwn(schema, '$schema')) {
      delete schema['$schema'];
    }
    generationConfig['responseSchema'] = schema;
  }

  if (params?.thinking) {
    const thinkingConfig: Record<string, any> = {};
    thinkingConfig['include_thoughts'] = true;
    thinkingConfig['thinking_budget'] = params.thinking.budget_tokens;
    generationConfig['thinking_config'] = thinkingConfig;
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

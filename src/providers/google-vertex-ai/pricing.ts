import { LogConfig, ModelInput, TokenInput } from '../types';
import { GOOGLE_VERTEX_AI } from '../../globals';
import { getPricingConfig } from '../../services/winky/handlers/modelConfig';
import { getFallbackModelName } from '../../utils/pricing';
import { getVertexModelFromId } from '../../services/winky/utils/vertexAi';

export const VertexAILogConfig: LogConfig = {
  getBaseURL: getBaseURL,
  modelConfig: modelConfig,
  tokenConfig: tokenConfig,
};

function getBaseURL() {
  return '';
}

const getMultimodalEmbeddingTokens = (
  input: TokenInput,
  reqBody: any,
  resBody: any
) => {
  const tokens = {
    reqUnits: 0,
    resUnits: 0,
    additionalUnits: {
      input_image: 0,
      input_video_plus: 0,
      input_video_standard: 0,
      input_video_essential: 0,
    },
  };
  reqBody.instances?.forEach((instance: any) => {
    if (instance.text) tokens.resUnits += instance.text.length;
    if (instance.image) {
      tokens.additionalUnits.input_image += 1;
    }
    if (instance.video) {
      let duration = 0;
      const intervalSec = instance.video.videoSegmentConfig?.intervalSec || 16;
      resBody.data?.forEach((data: any) => {
        data.video_embeddings?.forEach((videoEmbedding: any) => {
          duration += videoEmbedding.end_offset - videoEmbedding.start_offset;
        });
      });

      if (intervalSec < 8) tokens.additionalUnits.input_video_plus += duration;
      else if (intervalSec < 15)
        tokens.additionalUnits.input_video_standard += duration;
      else tokens.additionalUnits.input_video_essential += duration;
    }
  });
  return tokens;
};

const getMultimodalEmbeddingTokensForProxyRequest = (
  input: TokenInput,
  reqBody: any,
  resBody: any
) => {
  const tokens = {
    reqUnits: 0,
    resUnits: 0,
    additionalUnits: {
      input_image: 0,
      input_video_plus: 0,
      input_video_standard: 0,
      input_video_essential: 0,
    },
  };
  reqBody.instances?.forEach((instance: any) => {
    if (instance.text) tokens.resUnits += instance.text.length;
    if (instance.image) {
      tokens.additionalUnits.input_image += 1;
    }
    if (instance.video) {
      let duration = 0;
      const intervalSec = instance.video.videoSegmentConfig?.intervalSec || 16;
      resBody.predictions?.forEach((prediction: any) => {
        prediction.videoEmbeddings?.forEach((videoEmbedding: any) => {
          duration +=
            videoEmbedding.endOffsetSec - videoEmbedding.startOffsetSec;
        });
      });

      if (intervalSec < 8) tokens.additionalUnits.input_video_plus += duration;
      else if (intervalSec < 15)
        tokens.additionalUnits.input_video_standard += duration;
      else tokens.additionalUnits.input_video_essential += duration;
    }
  });
  return tokens;
};

const getChatCompletionsTokensForProxyRequest = (resBody: any) => {
  const {
    promptTokenCount = 0,
    candidatesTokenCount = 0,
    thoughtsTokenCount = 0,
  } = resBody.usageMetadata;

  return {
    reqUnits: promptTokenCount,
    resUnits: candidatesTokenCount,
    additionalUnits: {
      thinking_token: thoughtsTokenCount,
    },
  };
};

const getVideoGenerationTokens = (reqBody: any) => {
  const parameters = reqBody.parameters || {};
  const durationSeconds = Number(parameters.durationSeconds ?? 0);
  const sampleCount = Number(parameters.sampleCount ?? 1);

  const totalSeconds = durationSeconds * sampleCount;

  const tokens = {
    reqUnits: 0,
    resUnits: 0,
    additionalUnits: {
      video_seconds: totalSeconds,
    },
  };

  return tokens;
};

async function modelConfig(input: ModelInput) {
  const { url, reqBody, resBody } = input;
  // handle openapi/chat/completions

  if (resBody.model?.includes('@')) {
    const parts = resBody.model.split('@');
    return parts[0];
  }

  // model for embedding will come as `/publishers/google/models/text-embedding-004`
  if (resBody.model?.includes('publishers')) {
    const model = resBody.model.split('/')?.pop();
    return model;
  }

  // Can be a custom model/fine-tuned model (ex: projects/<project-id>/locations/us-central1/models/<model-id>)
  if (resBody.model?.includes('projects')) {
    const _model = resBody.model.split('/')?.pop();
    const model = await getVertexModelFromId(
      _model,
      input.providerOptions,
      false,
      input.env
    );
    if (model) {
      return model;
    }
  }

  if (url.includes('/openapi/chat/completions')) return reqBody.model;
  // handle self deployed models
  if (reqBody.model && reqBody.model.startsWith('endpoints.')) {
    if (resBody.model) return resBody.model;
    else return reqBody.model;
  }

  if (!url) {
    return reqBody.model || resBody.model;
  }
  // tokenization requests form batches for /v1/chat/completions will send url as `https://api.openai.com/v1/chat/completions`
  try {
    const urlObject = new URL(url);
    const path = urlObject.pathname;

    if (path === '/v1/chat/completions') {
      return reqBody.model || resBody.model;
    }
  } catch {
    // ignore
  }

  let model;
  const fallbackModel = getFallbackModelName(GOOGLE_VERTEX_AI, url);
  try {
    const vertexUrl = new URL(url);
    model = vertexUrl.pathname.split('/')[9].split(':')[0];
    if (!model) {
      model = fallbackModel;
    }
  } catch (e) {
    model = fallbackModel;
  }
  return model;
}

async function tokenConfig(input: TokenInput) {
  const { resBody, reqBody, url, originalResBody } = input;

  // handle embeddings proxy route
  // note that tokens here are in characters, not tokens, pricing json is updated to reflect this
  if (
    resBody?.predictions?.some(
      (prediction: any) =>
        prediction.embeddings ||
        prediction.textEmbedding ||
        prediction.imageEmbedding ||
        prediction.videoEmbedding
    )
  ) {
    // multimodal embedding proxy route
    if (url.includes('multimodalembedding')) {
      return getMultimodalEmbeddingTokensForProxyRequest(
        input,
        reqBody,
        resBody
      );
    }
    return {
      reqUnits:
        resBody.predictions?.reduce(
          (acc: any, curr: any) =>
            acc + (curr.embeddings?.statistics?.token_count || 0),
          0
        ) || 0,
      resUnits: 0,
    };
  }

  // handle chat completions proxy route for gemini models
  if (resBody.candidates) {
    return getChatCompletionsTokensForProxyRequest(resBody);
  }

  // Detect Veo video generation (Veo models use predictLongRunning endpoint)
  const urlLower = url.toLowerCase();

  const isVideoGeneration =
    urlLower.includes('veo') && urlLower.includes('predictlongrunning');

  if (isVideoGeneration) {
    const model = reqBody.model || input.model;
    const urlForPricing = url;

    // Fetch base pricing to read default parameters from pricing JSON
    const basePricing = await getPricingConfig(
      GOOGLE_VERTEX_AI,
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

    // Read defaults from additional_units, similar to togetherAi's default_steps
    const defaultDurationSeconds =
      (basePricing?.pay_as_you_go?.additional_units as any)?.[
        'default_duration_seconds'
      ]?.price || 8;
    const defaultSampleCount =
      (basePricing?.pay_as_you_go?.additional_units as any)?.[
        'default_sample_count'
      ]?.price || 1;

    const defaults = {
      durationSeconds: defaultDurationSeconds,
      sampleCount: defaultSampleCount,
    };
    const mergedParameters = {
      ...defaults,
      ...(reqBody.parameters || {}),
    };
    return getVideoGenerationTokens({
      ...reqBody,
      parameters: mergedParameters,
    });
  }

  if (input.model === 'multimodalembedding') {
    return getMultimodalEmbeddingTokens(input, reqBody, resBody);
  }
  let web_search = 0;
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

    web_search = webRequestCount > 0 ? 1 : 0;
    maps = mapRequestCount > 0 ? 1 : 0;
  }

  // handles anthropic messages format
  if (
    resBody.usage?.input_tokens != null &&
    resBody.usage?.input_tokens != undefined
  ) {
    return {
      reqUnits:
        resBody.usage?.input_tokens +
        (resBody.usage?.cache_creation_input_tokens ?? 0) +
        (resBody.usage?.cache_read_input_tokens ?? 0),
      resUnits: resBody.usage?.output_tokens,
      cacheReadInputUnits: resBody.usage?.cache_read_input_tokens,
      cacheWriteInputUnits: resBody.usage?.cache_creation_input_tokens,
    };
  }

  // handle image generation models like gemini-2.5-flash-image
  const imageTokens =
    originalResBody?.usageMetadata?.candidatesTokensDetails?.reduce(
      (acc: any, curr: any) => {
        return acc + (curr.modality === 'IMAGE' ? curr.tokenCount : 0);
      },
      0
    );

  const baseFinetuneTokenUnits = resBody.usage?.fine_tuning_tokens || 0;
  const epochs = resBody.hyperparameters?.n_epochs || 1;
  const finetuneTokenUnits = baseFinetuneTokenUnits * epochs;
  return {
    reqUnits: resBody.usage?.prompt_tokens || 0,
    resUnits: resBody.usage?.completion_tokens || 0,
    cacheReadInputUnits:
      resBody.usage?.cache_read_input_tokens ||
      resBody.usage?.prompt_tokens_details?.cached_tokens ||
      0,
    cacheWriteInputUnits: resBody.usage?.cache_creation_input_tokens || 0,
    additionalUnits: {
      web_search,
      maps,
      thinking_token:
        resBody?.usage?.completion_tokens_details?.reasoning_tokens || 0,
      finetune_token_units: finetuneTokenUnits,
      image_token: imageTokens || 0,
    },
  };
}

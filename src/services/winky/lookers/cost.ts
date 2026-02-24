import {
  GenerationCost,
  PRICING_ADDITIONAL_UNIT_KEY,
  PricingConfig,
  Tokens,
} from '../../../providers/types';

const DEFAULT_BATCH_PRICING_MULTIPLIER = 0.5;

function addImageCost(
  payAsYouGoPricing: PricingConfig['pay_as_you_go'],
  requestBody: Record<string, any>,
  totalCost: GenerationCost,
  tokens: Tokens
) {
  const quality = requestBody['quality'] || 'default';
  const size = requestBody['size'] || 'default';
  totalCost.responseCost +=
    payAsYouGoPricing['image']?.[quality]?.[size]?.price || 0;

  // Handling image edit cost
  totalCost.requestCost +=
    (payAsYouGoPricing['request_image_token']?.price || 0) *
    (tokens.reqImageUnits || 0);
  totalCost.requestCost +=
    (payAsYouGoPricing['cached_image_input_token']?.price || 0) *
    (tokens.cachedImageUnits || 0);
  totalCost.requestCost +=
    (payAsYouGoPricing['request_text_token']?.price || 0) *
    (tokens.reqTextUnits || 0);
  totalCost.requestCost +=
    (payAsYouGoPricing['cached_text_input_token']?.price || 0) *
    (tokens.cachedTextUnits || 0);

  // no need to add response image token cost as it is already added in the image cost
  totalCost.responseCost +=
    (payAsYouGoPricing['response_text_token']?.price || 0) *
    (tokens.resTextUnits || 0);
}

function addRegularTokenCost(
  tokens: Tokens,
  payAsYouGoPricing: PricingConfig['pay_as_you_go'],
  totalCost: GenerationCost
) {
  const regularReqUnits =
    tokens.reqUnits -
    (tokens.cacheReadInputUnits ?? 0) -
    (tokens.cacheWriteInputUnits ?? 0) -
    // (inputCacheUnits?.cacheReadAudioInputUnits ?? 0) -
    (tokens.reqAudioUnits ?? 0);

  const regularResUnits = tokens.resUnits - (tokens.resAudioUnits ?? 0);

  totalCost.requestCost +=
    (payAsYouGoPricing['request_token']?.price || 0) * regularReqUnits;
  totalCost.responseCost +=
    (payAsYouGoPricing['response_token']?.price || 0) * regularResUnits;
}

function addCacheTokenCost(
  tokens: Tokens,
  payAsYouGoPricing: PricingConfig['pay_as_you_go'],
  totalCost: GenerationCost
) {
  if (payAsYouGoPricing['cache_read_input_token']?.price) {
    totalCost.requestCost +=
      (payAsYouGoPricing['cache_read_input_token'].price || 0) *
      (tokens.cacheReadInputUnits || 0);
  }

  if (payAsYouGoPricing['cache_write_input_token']?.price) {
    totalCost.requestCost +=
      (payAsYouGoPricing['cache_write_input_token'].price || 0) *
      (tokens.cacheWriteInputUnits || 0);
  }

  if (payAsYouGoPricing['cache_read_audio_input_token']?.price) {
    totalCost.requestCost +=
      (payAsYouGoPricing['cache_read_audio_input_token'].price || 0) *
      (tokens.cacheReadAudioInputUnits || 0);
  }
}

function addAudioCost(
  tokens: Tokens,
  payAsYouGoPricing: PricingConfig['pay_as_you_go'],
  totalCost: GenerationCost
) {
  if (payAsYouGoPricing['response_audio_token']?.price) {
    totalCost.responseCost +=
      (payAsYouGoPricing['response_audio_token'].price || 0) *
      (tokens.resAudioUnits || 0);
  }

  if (payAsYouGoPricing['request_audio_token']?.price) {
    totalCost.requestCost +=
      (payAsYouGoPricing['request_audio_token'].price || 0) *
      ((tokens.reqAudioUnits || 0) - (tokens.cacheReadAudioInputUnits || 0));
  }
}

function addFixedCost(
  fixedCost: PricingConfig['fixed_cost'],
  totalCost: GenerationCost
) {
  if (fixedCost) {
    totalCost.requestCost += fixedCost['request']?.price || 0;
    totalCost.responseCost += fixedCost['response']?.price || 0;
  }
}

function addAdditionalUnitsCost(
  tokens: Tokens,
  payAsYouGoPricing: PricingConfig['pay_as_you_go'],
  totalCost: GenerationCost
) {
  const additionalUnitsPricing = payAsYouGoPricing['additional_units'];
  const additionalUnits = tokens.additionalUnits;
  if (!additionalUnitsPricing || !additionalUnits) {
    return;
  }

  for (const key of Object.keys(
    additionalUnits
  ) as PRICING_ADDITIONAL_UNIT_KEY[]) {
    if (
      additionalUnitsPricing[key] &&
      'price' in (additionalUnitsPricing[key] || {}) &&
      typeof additionalUnits[key] === 'number'
    ) {
      const units = additionalUnits[key] ?? 0;
      const unitPrice = additionalUnitsPricing[key]?.price ?? 0;
      totalCost.responseCost += unitPrice * units;
    }
  }
}

function addFinetuneCost(
  tokens: Tokens,
  config: PricingConfig['finetune_config'],
  totalCost: GenerationCost
) {
  if (!config) {
    return;
  }

  const { pay_per_token, pay_per_hour } = config;

  if (pay_per_token) {
    totalCost.requestCost +=
      pay_per_token.price *
      (tokens.additionalUnits?.['finetune_token_units'] || 0);
  }

  if (pay_per_hour) {
    totalCost.requestCost +=
      pay_per_hour.price *
      (tokens.additionalUnits?.['finetune_training_hours'] ?? 0);
  }
}

function getBatchImagePricing(batchImage: any, baseImage: any): any {
  if (batchImage) return batchImage;
  if (!baseImage) return undefined;
  const result: any = {};
  for (const quality of Object.keys(baseImage)) {
    result[quality] = {};
    for (const size of Object.keys(baseImage[quality])) {
      if (baseImage[quality][size]?.price !== undefined) {
        result[quality][size] = {
          price:
            baseImage[quality][size].price * DEFAULT_BATCH_PRICING_MULTIPLIER,
        };
      }
    }
  }
  return result;
}

function getBatchPrice(
  batchPrice?: { price: number },
  basePrice?: { price: number }
) {
  if (batchPrice?.price !== undefined) {
    return { price: batchPrice.price };
  }
  if (basePrice?.price !== undefined) {
    return { price: basePrice.price * DEFAULT_BATCH_PRICING_MULTIPLIER };
  }
  return undefined;
}

function getBatchPricing(
  pricingConfig: PricingConfig
): PricingConfig['pay_as_you_go'] {
  const { batch_config, pay_as_you_go } = pricingConfig;

  return {
    ...pay_as_you_go,
    request_token: getBatchPrice(
      batch_config?.request_token,
      pay_as_you_go?.request_token
    ),
    response_token: getBatchPrice(
      batch_config?.response_token,
      pay_as_you_go?.response_token
    ),
    cache_write_input_token: getBatchPrice(
      batch_config?.cache_write_input_token,
      pay_as_you_go?.cache_write_input_token
    ),
    cache_read_input_token: getBatchPrice(
      batch_config?.cache_read_input_token,
      pay_as_you_go?.cache_read_input_token
    ),
    cache_read_audio_input_token: getBatchPrice(
      batch_config?.cache_read_audio_input_token,
      pay_as_you_go?.cache_read_audio_input_token
    ),
    request_audio_token: getBatchPrice(
      batch_config?.request_audio_token,
      pay_as_you_go?.request_audio_token
    ),
    response_audio_token: getBatchPrice(
      batch_config?.response_audio_token,
      pay_as_you_go?.response_audio_token
    ),
    request_image_token: getBatchPrice(
      batch_config?.request_image_token,
      pay_as_you_go?.request_image_token
    ),
    response_image_token: getBatchPrice(
      batch_config?.response_image_token,
      pay_as_you_go?.response_image_token
    ),
    request_text_token: getBatchPrice(
      batch_config?.request_text_token,
      pay_as_you_go?.request_text_token
    ),
    response_text_token: getBatchPrice(
      batch_config?.response_text_token,
      pay_as_you_go?.response_text_token
    ),
    cached_image_input_token: getBatchPrice(
      batch_config?.cached_image_input_token,
      pay_as_you_go?.cached_image_input_token
    ),
    cached_text_input_token: getBatchPrice(
      batch_config?.cached_text_input_token,
      pay_as_you_go?.cached_text_input_token
    ),
    image: getBatchImagePricing(batch_config?.image, pay_as_you_go?.image),
  };
}

export const calculateCost = (
  tokens: Tokens,
  pricingConfig: PricingConfig | null,
  requestBody: Record<string, any>,
  isSuccess: boolean,
  isBatch: boolean = false
): GenerationCost => {
  const totalCost: GenerationCost = {
    requestCost: 0,
    responseCost: 0,
    currency: pricingConfig?.currency || 'USD',
  };

  if (!pricingConfig || !isSuccess) {
    return totalCost;
  }

  const {
    pay_as_you_go: payAsYouGoPricing,
    fixed_cost: fixedCost,
    finetune_config: finetuneConfig = {},
  } = pricingConfig;

  addFixedCost(fixedCost, totalCost);

  if (!payAsYouGoPricing) {
    return totalCost;
  }

  const effectivePricing = isBatch
    ? getBatchPricing(pricingConfig)
    : payAsYouGoPricing;

  // Handle image generation cost
  // Currently we do not support any use case which includes both image and text generation
  if (effectivePricing['image'] && requestBody) {
    addImageCost(effectivePricing, requestBody, totalCost, tokens);
    return totalCost;
  }

  addRegularTokenCost(tokens, effectivePricing, totalCost);

  addCacheTokenCost(tokens, effectivePricing, totalCost);

  addAudioCost(tokens, effectivePricing, totalCost);

  addAdditionalUnitsCost(tokens, effectivePricing, totalCost);

  // Add fine-tune cost using additional units and finetune pricing config
  addFinetuneCost(tokens, finetuneConfig, totalCost);

  return totalCost;
};

/**
 * Tripo3D Pricing Configuration
 *
 * This pricing table is based on Tripo3D's public pricing as of August 2025.
 * Source: https://platform.tripo3d.ai/docs/billing
 *
 * NOTE: This table should be updated when Tripo3D changes their pricing.
 * These are estimates based on task type and parameters.
 */

export interface Tripo3DPricingConfig {
  // Base costs for different task types
  baseCosts: Record<string, number>;

  // Quality and feature modifiers
  modifiers: {
    texture_quality: Record<string, number>;
    features: Record<string, number>;
  };
}

export const TRIPO3D_PRICING: Tripo3DPricingConfig = {
  // Base task costs in credits
  baseCosts: {
    // Text/Image to 3D generation
    text_to_3d: 10,
    image_to_3d: 10,
    multiview_to_3d: 10,

    // Model processing
    refine_model: 5,
    retexture: 5,
    stylize: 5,

    // Animation and rigging
    animate: 15,
    rig: 10,

    // Conversion and export
    convert: 2,
    export: 1,

    // Enhancement features
    enhance: 8,
    upscale: 5,

    // Default for unknown types
    default: 5,
  },

  modifiers: {
    texture_quality: {
      standard: 0,
      high: 5,
      ultra: 10,
    },

    features: {
      // PBR material generation
      pbr: 2,

      // Quad topology generation
      quad: 3,

      // Animation features
      with_animation: 5,
      bake_animation: 2,

      // Texture features
      pack_uv: 1,
      bake: 2,
    },
  },
};

/**
 * Calculate estimated credits for a Tripo3D task
 * @param taskType - The type of task being created
 * @param params - Task parameters that affect pricing
 * @returns Estimated credits that will be consumed
 */
export function calculateEstimatedCredits(
  taskType: string,
  params: Record<string, any> = {}
): number {
  // Get base cost for task type
  let credits =
    TRIPO3D_PRICING.baseCosts[taskType] || TRIPO3D_PRICING.baseCosts.default;

  // Add texture quality modifier
  const textureQuality = params.texture_quality || 'standard';
  if (TRIPO3D_PRICING.modifiers.texture_quality[textureQuality]) {
    credits += TRIPO3D_PRICING.modifiers.texture_quality[textureQuality];
  }

  // Add feature modifiers
  const features = TRIPO3D_PRICING.modifiers.features;

  if (params.pbr === true) {
    credits += features.pbr || 0;
  }

  if (params.quad === true) {
    credits += features.quad || 0;
  }

  if (params.with_animation === true) {
    credits += features.with_animation || 0;
  }

  if (params.bake_animation === true) {
    credits += features.bake_animation || 0;
  }

  if (params.pack_uv === true) {
    credits += features.pack_uv || 0;
  }

  if (params.bake === true) {
    credits += features.bake || 0;
  }

  // Ensure minimum of 1 credit
  return Math.max(credits, 1);
}

/**
 * Get pricing information for a specific task type
 * @param taskType - The task type to get pricing for
 * @returns Pricing information object
 */
export function getTaskTypePricing(taskType: string) {
  return {
    taskType,
    baseCost:
      TRIPO3D_PRICING.baseCosts[taskType] || TRIPO3D_PRICING.baseCosts.default,
    availableModifiers: Object.keys(TRIPO3D_PRICING.modifiers.features),
    textureQualityOptions: Object.keys(
      TRIPO3D_PRICING.modifiers.texture_quality
    ),
  };
}

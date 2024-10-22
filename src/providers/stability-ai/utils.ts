import { STABILITY_V1_MODELS } from './constants';

export const isStabilityV1Model = (model?: string) => {
  if (!model) return false;
  return STABILITY_V1_MODELS.includes(model);
};

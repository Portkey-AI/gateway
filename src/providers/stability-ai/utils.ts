import { STABILITY_V1_MODELS } from './constants';

export const isStabilityV1Model = (model?: string | Params) => {
  if (!model || typeof model !== 'string') return false;
  return STABILITY_V1_MODELS.includes(model);
};

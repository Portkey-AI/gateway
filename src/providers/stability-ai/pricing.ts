import { getDefaultModelName, getFallbackModelName } from '../../utils/pricing';
import { LogConfig, ModelInput } from '../types';
import { STABILITY_AI } from '../../globals';

export const StabilityAiLogConfig: LogConfig = {
  getBaseURL: getBaseURL,
  modelConfig: modelConfig,
  tokenConfig: tokenConfig,
};

function getBaseURL() {
  return 'https://api.stability.ai/v1';
}

function modelConfig(input: ModelInput) {
  const { reqBody, resBody, url } = input;
  let model = getDefaultModelName(reqBody, resBody);
  if (!model) {
    const fallbackModelName = getFallbackModelName(STABILITY_AI, url);
    try {
      const stabilityAIURL = new URL(url);
      // v2beta url structure: https://api.stability.ai/v2beta/stable-image/generate/sd3
      if (url.includes('/v2beta/')) {
        model = stabilityAIURL.pathname.split('/').pop();
      } else {
        // v1 url structure: $BASE_URL/v1/generation/stable-diffusion-v1-6/text-to-image
        model = stabilityAIURL.pathname.split('/')[3];
      }

      if (!model) {
        model = fallbackModelName;
      }
    } catch (e) {
      model = fallbackModelName;
    }
  }
  return model;
}

function tokenConfig() {
  return { reqUnits: 0, resUnits: 0 };
}

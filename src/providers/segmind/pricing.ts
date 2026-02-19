import { getDefaultModelName, getFallbackModelName } from '../../utils/pricing';
import { LogConfig, ModelInput } from '../types';
import { SEGMIND } from '../../globals';

export const SegmindLogConfig: LogConfig = {
  getBaseURL: getBaseURL,
  modelConfig: modelConfig,
  tokenConfig: tokenConfig,
};

function getBaseURL() {
  return 'https://api.segmind.com/v1';
}

function modelConfig(input: ModelInput) {
  const { reqBody, resBody, url } = input;
  let model = getDefaultModelName(reqBody, resBody);
  if (!model) {
    const fallbackModelName = getFallbackModelName(SEGMIND, url);
    try {
      const segmindURL = new URL(url);
      model = segmindURL.pathname.split('/')[2];
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

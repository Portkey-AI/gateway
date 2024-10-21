import {
  HookEventType,
  PluginContext,
  PluginHandler,
  PluginParameters,
} from '../types';

export const handler: PluginHandler = async (
  context: PluginContext,
  parameters: PluginParameters,
  eventType: HookEventType
) => {
  if (eventType !== 'afterRequestHook') {
    return { error: null, verdict: true, data: {} };
  }

  const { response } = context;
  const { warningThreshold } = parameters;

  const confidenceScore = await detectMedicalAdvice(response);

  if (confidenceScore >= warningThreshold) {
    return {
      error: null,
      verdict: false,
      data: {
        warning:
          'Medical advice detected in the response. Please consult a professional.',
      },
    };
  }

  return {
    error: null,
    verdict: true,
    data: {},
  };
};

// Example of a mock medical advice detection function
async function detectMedicalAdvice(text: string): Promise<number> {
  // Placeholder logic to simulate detecting medical advice (0 means no confidence, 1 means high confidence)
  const medicalKeywords = [
    'prescribe',
    'diagnosis',
    'treatment',
    'medication',
    'symptoms',
  ];
  const found = medicalKeywords.some((keyword) => text.includes(keyword));

  return found ? 0.8 : 0.2;
}

import { FLEXAI } from '../../globals';
import {
  chatCompleteParams,
  completeParams,
  createSpeechParams,
  embedParams,
  responseTransformers,
} from '../open-ai-base';
import { ProviderConfigs } from '../types';
import FlexAIAPIConfig from './api';
import {
  FlexAIImageGenerateConfig,
  FlexAIImageGenerateResponseTransform,
} from './imageGenerate';

const FlexAIConfig: ProviderConfigs = {
  // `verbosity` is rejected by the FlexAI API.
  // `n` > 1 is rejected ("Multiple completions are not supported"), so it is
  // clamped rather than forwarded.
  chatComplete: chatCompleteParams(
    ['verbosity'],
    { model: 'Llama-3.3-70B-Instruct-FP8' },
    {
      n: {
        param: 'n',
        default: 1,
        min: 1,
        max: 1,
      },
    }
  ),
  // `suffix` is rejected by the FlexAI API.
  complete: completeParams(['suffix'], { model: 'Llama-3.3-70B-Instruct-FP8' }),
  // `dimensions` is rejected by the FlexAI API.
  embed: embedParams(['dimensions'], { model: 'bge-m3' }),
  imageGenerate: FlexAIImageGenerateConfig,
  createTranscription: {},
  // FlexAI currently serves `wav` only on /audio/speech; `mp3` is rejected.
  createSpeech: createSpeechParams([], {
    model: 'Kokoro-82M',
    response_format: 'wav',
  }),
  api: FlexAIAPIConfig,
  responseTransforms: {
    ...responseTransformers(FLEXAI, {
      chatComplete: true,
      complete: true,
      embed: true,
      createSpeech: true,
    }),
    imageGenerate: FlexAIImageGenerateResponseTransform,
  },
};

export default FlexAIConfig;

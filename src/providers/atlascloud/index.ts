import { ATLASCLOUD } from '../../globals';
import {
  chatCompleteParams,
  completeParams,
  responseTransformers,
} from '../open-ai-base';
import { ProviderConfigs } from '../types';
import { AtlasCloudAPIConfig } from './api';

const DEFAULT_MODEL = 'deepseek-ai/DeepSeek-V3.1-Terminus';

export const AtlasCloudConfig: ProviderConfigs = {
  // The default model goes through `extra` rather than `chatCompleteParams`'
  // defaultValues: that path mutates the shared OpenAIChatCompleteConfig.model
  // object, so providers overwrite each other's default.
  chatComplete: chatCompleteParams(
    [],
    {},
    {
      model: { param: 'model', required: true, default: DEFAULT_MODEL },
    }
  ),
  complete: completeParams([], { model: DEFAULT_MODEL }),
  api: AtlasCloudAPIConfig,
  responseTransforms: responseTransformers(ATLASCLOUD, {
    chatComplete: true,
    complete: true,
  }),
};

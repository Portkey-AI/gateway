import { DATABRICKS } from '../../globals';
import {
  chatCompleteParams,
  completeParams,
  embedParams,
  responseTransformers,
} from '../open-ai-base';
import { ProviderConfigs } from '../types';
import DatabricksAPIConfig from './api';

const DatabricksConfig: ProviderConfigs = {
  complete: completeParams([]),
  embed: embedParams(['model', 'dimensions', 'encoding_format', 'user']),
  api: DatabricksAPIConfig,
  chatComplete: chatCompleteParams(
    [],
    {},
    {
      thinking: {
        param: 'thinking',
        required: false,
      },
      reasoning_effort: {
        param: 'reasoning_effort',
        required: false,
      },
    }
  ),
  responseTransforms: responseTransformers(DATABRICKS, {
    complete: true,
    chatComplete: true,
    embed: true,
  }),
};

export default DatabricksConfig;

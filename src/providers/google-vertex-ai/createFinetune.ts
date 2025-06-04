import { GOOGLE_VERTEX_AI } from '../../globals';
import { ProviderConfig } from '../types';
import { GoogleErrorResponse, GoogleFinetuneRecord } from './types';
import { GoogleToOpenAIFinetune, transformVertexFinetune } from './utils';

export const GoogleVertexFinetuneConfig: ProviderConfig = {
  model: {
    param: 'baseModel',
    required: true,
  },
  training_file: {
    param: 'supervisedTuningSpec',
    required: true,
    transform: transformVertexFinetune,
  },
  suffix: {
    param: 'tunedModelDisplayName',
    required: true,
  },
  validation_file: {
    param: 'supervisedTuningSpec',
    required: false,
    transform: transformVertexFinetune,
  },
  method: {
    param: 'supervisedTuningSpec',
    required: false,
    transform: transformVertexFinetune,
  },
  hyperparameters: {
    param: 'supervisedTuningSpec',
    required: false,
    transform: transformVertexFinetune,
  },
};

export const GoogleFinetuneCreateResponseTransform = (
  input: Response | GoogleErrorResponse,
  status: number
) => {
  if (status !== 200) {
    return { ...input, provider: GOOGLE_VERTEX_AI };
  }
  return GoogleToOpenAIFinetune(input as unknown as GoogleFinetuneRecord);
};

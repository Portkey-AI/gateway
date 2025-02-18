import { ProviderConfig } from '../types';
import { GoogleBatchRecord } from './types';
import { getModelAndProvider, GoogleToOpenAIBatch } from './utils';

export const GoogleBatchCreateConfig: ProviderConfig = {
  model: {
    param: 'model',
    required: true,
    transform: (params: Record<string, any>) => {
      const { model, provider } = getModelAndProvider(params.model);
      return `publishers/${provider}/models/${model}`;
    },
  },
  input_file_id: {
    param: 'inputConfig',
    required: true,
    transform: (params: Record<string, any>) => {
      return {
        instancesFormat: 'jsonl',
        gcsSource: {
          uris: decodeURIComponent(params.input_file_id),
        },
      };
    },
  },
  output_data_config: {
    param: 'outputConfig',
    required: true,
    transform: (params: any) => {
      const providedOutputFile = decodeURIComponent(
        (params?.['output_data_config'] as string) ?? ''
      );
      return {
        predictionsFormat: 'jsonl',
        gcsDestination: {
          outputUriPrefix: providedOutputFile,
        },
      };
    },
    default: (params: any) => {
      const inputFileId = decodeURIComponent(params.input_file_id);
      const gcsURLToContainingFolder =
        inputFileId.split('/').slice(0, -1).join('/') + '/';
      return {
        predictionsFormat: 'jsonl',
        gcsDestination: {
          outputUriPrefix: gcsURLToContainingFolder,
        },
      };
    },
  },
  job_name: {
    param: 'displayName',
    required: true,
    default: () => {
      return crypto.randomUUID();
    },
  },
};

export const GoogleBatchCreateResponseTransform = (
  response: Response,
  responseStatus: number
) => {
  if (responseStatus === 200) {
    return GoogleToOpenAIBatch(response as unknown as GoogleBatchRecord);
  }
  return response;
};

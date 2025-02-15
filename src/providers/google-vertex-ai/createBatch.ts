import { ProviderConfig, RequestHandler } from '../types';
import GoogleApiConfig from './api';
import { GoogleBatchRecord } from './types';
import {
  fetchGoogleCustomEndpoint,
  getModelAndProvider,
  GoogleResponseHandler,
  GoogleToOpenAIBatch,
} from './utils';

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

export const GoogleBatchCreateHandler: RequestHandler<Params> = async ({
  c,
  requestBody,
  providerOptions,
}) => {
  const { vertexModelName, vertexProjectId, vertexRegion } = providerOptions;

  let projectId = vertexProjectId;

  const { model, provider } = getModelAndProvider(vertexModelName ?? '');

  const createBatchesHeaders = await GoogleApiConfig.headers({
    c,
    providerOptions,
    fn: 'createBatch',
    transformedRequestBody: {},
    transformedRequestUrl: '',
    gatewayRequestBody: {},
  });

  const { Authorization } = createBatchesHeaders;

  const inputFile = decodeURIComponent(
    (requestBody?.['input_file_id'] as string) ?? ''
  );
  const providedOutputFile = decodeURIComponent(
    (requestBody?.['output_file_id'] as string) ?? ''
  );
  const outputFile =
    providedOutputFile ?? inputFile.split('.jsonl')[0] + `output`;
  const body = {
    inputConfig: {
      instancesFormat: 'jsonl',
      gcsSource: {
        uris: inputFile,
      },
    },
    outputConfig: {
      predictionsFormat: 'jsonl',
      gcsDestination: {
        outputUriPrefix: outputFile,
      },
    },
    displayName: crypto.randomUUID(),
    model: `publishers/${provider}/models/${model}`,
  };

  const url = `https://${vertexRegion}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${vertexRegion}/batchPredictionJobs`;

  const response = (await fetchGoogleCustomEndpoint({
    url,
    body,
    method: 'POST',
    authorization: Authorization,
  })) as {
    response: GoogleBatchRecord | null;
    error: any;
    status: number | null;
  };

  if (!response.response || response.error) {
    return GoogleResponseHandler(response.error, response.status ?? 500);
  }

  return GoogleResponseHandler(GoogleToOpenAIBatch(response.response), 200);
};

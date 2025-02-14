import { GoogleBatchRecord, RequestHandler } from '../types';
import {
  fetchGoogleCustomEndpoint,
  getAccessToken,
  getModelAndProvider,
  GoogleResponseHandler,
  GoogleToOpenAIBatch,
} from './utils';

export const GoogleBatchCreateHandler: RequestHandler<Params> = async ({
  requestBody,
  providerOptions,
}) => {
  const {
    vertexModelName,
    apiKey,
    vertexProjectId,
    vertexRegion,
    vertexServiceAccountJson,
  } = providerOptions;

  let authToken = apiKey;
  let projectId = vertexProjectId;

  const { model, provider } = getModelAndProvider(vertexModelName ?? '');

  if (vertexServiceAccountJson) {
    authToken = await getAccessToken(vertexServiceAccountJson);
    projectId = vertexServiceAccountJson['project_id'];
  }

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
    authInfo: {
      token: authToken ?? '',
    },
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

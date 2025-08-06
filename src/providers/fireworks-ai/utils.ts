import { FinetuneResponse, FinetuneState, FireworksFile } from './types';

export const fireworksDatasetToOpenAIFile = (dataset: FireworksFile) => {
  const name = dataset.displayName || dataset.name;
  const id = name.split('/').at(-1);
  const state = dataset.state.toLowerCase();

  return {
    id: id,
    filename: `${id}.jsonl`,
    // Doesn't support batches, so default to fine-tune
    purpose: 'fine-tune',
    organisation_id: name.split('/').at(1),
    status: state === 'ready' ? 'processed' : state,
    created_at: new Date(dataset.createTime).getTime(),
    object: 'file',
  };
};

export const getUploadEndpoint = async ({
  datasetId,
  headers,
  baseURL,
  contentLength,
}: {
  datasetId: string;
  headers: Record<string, string>;
  baseURL: string;
  contentLength: number;
}) => {
  const result: {
    endpoint: string | null;
    error: string | null;
  } = {
    endpoint: null,
    error: null,
  };
  const body = {
    filenameToSize: {
      [`${datasetId}.jsonl`]: contentLength,
    },
  };

  try {
    const response = await fetch(
      `${baseURL}/datasets/${datasetId}:getUploadEndpoint`,
      {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      result.error = await response.text();
    }

    const responseJson = (await response.json()) as any;
    result.endpoint =
      responseJson?.filenameToSignedUrls?.[`${datasetId}.jsonl`];
  } catch (error) {
    result.error = (error as Error).message;
  }

  return result;
};

export const createDataset = async ({
  datasetId,
  headers,
  baseURL,
}: {
  datasetId: string;
  headers: Record<string, string>;
  baseURL: string;
}) => {
  const result: {
    created: boolean;
    error: string | null;
  } = {
    created: false,
    error: null,
  };
  const response = await fetch(`${baseURL}/datasets`, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify({
      datasetId: datasetId,
      dataset: {
        userUploaded: {},
      },
    }),
  });

  if (response.ok) {
    result.created = true;
  }

  if (!response.ok) {
    result.error = await response.text();
  }

  return result;
};

export const validateDataset = async ({
  datasetId,
  headers,
  baseURL,
}: {
  datasetId: string;
  headers: Record<string, string>;
  baseURL: string;
}) => {
  const response = await fetch(
    `${baseURL}/datasets/${datasetId}:validateUpload`,
    {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({}),
    }
  );

  if (!response.ok) {
    return {
      valid: false,
      error: await response.text(),
    };
  }

  return {
    valid: true,
  };
};

const finetuneStateMap = (state: FinetuneState) => {
  switch (state) {
    case FinetuneState.JOB_STATE_CANCELLED:
    case FinetuneState.JOB_STATE_DELETING:
      return 'cancelled';

    case FinetuneState.JOB_STATE_COMPLETED:
      return 'succeeded';
    case FinetuneState.JOB_STATE_FAILED:
      return 'failed';
    case FinetuneState.JOB_STATE_CREATING:
    case FinetuneState.JOB_STATE_EVALUATION:
    case FinetuneState.JOB_STATE_RUNNING:
    case FinetuneState.JOB_STATE_WRITING_RESULTS:
      return 'running';
    case FinetuneState.JOB_STATE_VALIDATING:
      return 'queued';
    default:
      return 'queued';
  }
};

export const fireworkFinetuneToOpenAIFinetune = (
  response: FinetuneResponse
) => {
  const id = response?.name?.split('/').at(-1);
  const model = response?.baseModel?.split('/').at(-1);
  const trainingFile = response?.dataset?.split('/').at(-1);
  const validationFile = response?.evaluationDataset?.split('/').at(-1);
  const suffix = response?.outputModel;
  const createdAt = new Date(response?.createTime).getTime();
  const completedAt =
    response.completedTime && new Date(response.completedTime).getTime();
  const hyperparameters = {
    n_epochs: response?.epochs,
    learning_rate: response?.learningRate,
  };
  const status = finetuneStateMap(response.state);
  const outputModel = response?.outputModel;

  return {
    id: id,
    model: model,
    suffix: suffix,
    training_file: trainingFile,
    validation_file: validationFile,
    hyperparameters: hyperparameters,
    created_at: createdAt,
    completed_at: completedAt,
    status,
    ...(status === 'failed' && { error: response.status }),
    ...(outputModel && { fine_tuned_model: outputModel }),
  };
};

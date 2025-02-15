import { FireworksFile } from './types';

export const fireworksDatasetToOpenAIFile = (dataset: FireworksFile) => {
  const name = dataset.displayName || dataset.name;
  const id = name.split('/').at(-1);
  return {
    id: id,
    filename: `${id}.jsonl`,
    // Doesn't support batches, so default to fine-tune
    purpose: 'fine-tune',
    organisation_id: name.split('/').at(1),
    status: dataset.state.toLowerCase(),
    created_at: dataset.createTime,
    object: 'file',
  };
};

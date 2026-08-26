import { ProviderConfig } from '../types';

export const ValarCreateBatchConfig: ProviderConfig = {
  input_file_id: {
    param: 'input_file_id',
    required: true,
  },
  // Batches target `/v1/chat/completions` or `/v1/responses`.
  endpoint: {
    param: 'endpoint',
    required: true,
  },
  // `24h` is the only accepted value: Valar schedules a batch against its own
  // SLAs and keeps the field for OpenAI compatibility.
  completion_window: {
    param: 'completion_window',
    default: '24h',
    required: true,
  },
  metadata: {
    param: 'metadata',
    required: false,
  },
};

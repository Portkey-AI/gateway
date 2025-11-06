export interface FireworksFile {
  createTime: string;
  displayName: string;
  exampleCount: number;
  format: 'UNSPECIFIED_FORMAT' | 'CHAT' | 'COMPLETION';
  name: string;
  state: 'UPLOADING' | 'READY' | 'UNSPECIFIED';
  status: {
    code:
      | 'OK'
      | 'CANCELLED'
      | 'UNKNOWN'
      | 'INVALID_ARGUMENT'
      | 'DEADLINE_EXCEEDED'
      | 'NOT_FOUND'
      | 'ALREADY_EXISTS'
      | 'PERMISSION_DENIED'
      | 'UNAUTHENTICATED'
      | 'RESOURCE_EXHAUSTED'
      | 'FAILED_PRECONDITION'
      | 'ABORTED'
      | 'OUT_OF_RANGE'
      | 'UNIMPLEMENTED'
      | 'INTERNAL'
      | 'UNAVAILABLE'
      | 'DATA_LOSS';
    message: string;
  };
  userUploaded: Record<string, any>;
}

export enum FinetuneState {
  JOB_STATE_UNSPECIFIED = 'JOB_STATE_UNSPECIFIED',
  JOB_STATE_CREATING = 'JOB_STATE_CREATING',
  JOB_STATE_RUNNING = 'JOB_STATE_RUNNING',
  JOB_STATE_COMPLETED = 'JOB_STATE_COMPLETED',
  JOB_STATE_FAILED = 'JOB_STATE_FAILED',
  JOB_STATE_CANCELLED = 'JOB_STATE_CANCELLED',
  JOB_STATE_DELETING = 'JOB_STATE_DELETING',
  JOB_STATE_WRITING_RESULTS = 'JOB_STATE_WRITING_RESULTS',
  JOB_STATE_VALIDATING = 'JOB_STATE_VALIDATING',
  JOB_STATE_ROLLOUT = 'JOB_STATE_ROLLOUT',
  JOB_STATE_EVALUATION = 'JOB_STATE_EVALUATION',
}

export interface FinetuneResponse {
  baseModel: string;
  completedTime: string | null;
  createTime: string;
  createdBy: string;
  dataset: string;
  displayName: string;
  earlyStop: boolean;
  epochs: number;
  evalAutoCarveout: boolean;
  evaluationDataset: string;
  isTurbo: boolean;
  jinjaTemplate: string;
  learningRate: number;
  loraRank: number;
  maxContextLength: number;
  name: string;
  outputModel: string;
  state: FinetuneState;
  status: {
    code: string;
    message: string;
  };
  wandbConfig: null;
  warmStartFrom: string;
}

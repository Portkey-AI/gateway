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

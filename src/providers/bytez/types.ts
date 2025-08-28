interface Model {
  task: string;
}

interface BytezResponse {
  error: string;
  output: Model[];
}

export { Model, BytezResponse };

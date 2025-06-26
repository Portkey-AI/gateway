interface Model {
  task: string;
}

interface BytezResponse {
  error: string;
  output: Model[];
  // add other model properties as needed
}

export { Model, BytezResponse };

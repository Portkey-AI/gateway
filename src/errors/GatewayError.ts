export class GatewayError extends Error {
  constructor(
    message: string,
    public status: number = 500,
    public cause?: Error
  ) {
    super(message);
    this.name = 'GatewayError';
    this.status = status;
  }
}

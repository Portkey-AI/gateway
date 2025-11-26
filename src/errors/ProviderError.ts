import { PortkeyError } from './PortkeyError';

export class ProviderError extends PortkeyError {
  public provider: string;
  public rawError: any;

  constructor(
    code: string,
    message: string,
    provider: string,
    status?: number,
    rawError: any = null
  ) {
    super(code, message, status);
    this.provider = provider;
    this.rawError = rawError;
    this.name = 'ProviderError';
  }
}

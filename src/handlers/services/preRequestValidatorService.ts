// preRequestValidatorService.ts

import { Context } from 'hono';
import { RequestContext } from './requestContext';

export class PreRequestValidatorService {
  private preRequestValidator: any;
  constructor(
    private honoContext: Context,
    private requestContext: RequestContext
  ) {
    this.preRequestValidator = this.honoContext.get('preRequestValidator');
  }

  async getResponse(): Promise<Response | undefined> {
    if (!this.preRequestValidator) {
      return undefined;
    }
    return await this.preRequestValidator(
      this.honoContext,
      this.requestContext.providerOption,
      this.requestContext.requestHeaders,
      this.requestContext.params
    );
  }
}

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

  async getResponse(): Promise<{
    response: Response | undefined;
    modelPricingConfig: Record<string, any> | undefined;
  }> {
    if (!this.preRequestValidator) {
      return { response: undefined, modelPricingConfig: undefined };
    }
    const result = await this.preRequestValidator(
      this.honoContext,
      this.requestContext.providerOption,
      this.requestContext.requestHeaders,
      this.requestContext.params
    );

    return {
      response: result?.response,
      modelPricingConfig: result?.modelPricingConfig,
    };
  }
}

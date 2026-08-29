import { getAzureResponsesModelValue } from './utils';

describe('Azure OpenAI Responses request', () => {
  it('uses the Azure deployment name instead of the gateway model alias', () => {
    const model = getAzureResponsesModelValue(
      {
        model: '@openai-5-4-studio/gpt-5.4',
        input: 'Hello',
      } as any,
      {
        provider: 'azure-openai',
        deploymentId: 'gpt-5.4-studio',
        apiVersion: 'v1',
      }
    );

    expect(model).toBe('gpt-5.4-studio');
  });

  it('also uses the deployment name with dated Responses API versions', () => {
    const model = getAzureResponsesModelValue(
      { model: '@azure-provider/gpt-5.4', input: 'Hello' } as any,
      {
        provider: 'azure-openai',
        deploymentId: 'gpt-5.4-studio',
        apiVersion: '2025-04-01-preview',
      }
    );

    expect(model).toBe('gpt-5.4-studio');
  });
});

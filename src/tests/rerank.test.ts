import Providers from '../providers';
import testVariables from './resources/testVariables';
import { executeRerankEndpointTests } from './routeSpecificTestFunctions.ts/rerank';

for (const provider in testVariables) {
  const variables = testVariables[provider];
  const config = Providers[provider];

  // Skip providers that don't have rerank configuration
  if (!variables.rerank?.model) {
    continue;
  }

  // For Oracle, we need the oracle config instead of apiKey
  if (provider === 'oracle' && !variables.oracle?.tenancy) {
    console.log(`Skipping ${provider} as Oracle credentials are not provided`);
    continue;
  }

  // For other providers, check apiKey
  if (provider !== 'oracle' && !variables.apiKey) {
    console.log(`Skipping ${provider} as API key is not provided`);
    continue;
  }

  if (config?.rerank) {
    describe(`${provider} /rerank endpoint tests:`, () =>
      executeRerankEndpointTests(provider, variables));
  }
}

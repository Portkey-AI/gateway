import Providers from '../../../src/providers';
import testVariables from '../../../src/tests/resources/testVariables';
import { executeChatCompletionEndpointTests } from '../../../src/tests/routeSpecificTestFunctions.ts/chatCompletion';

for (const provider in testVariables) {
  const variables = testVariables[provider];
  const config = Providers[provider];

  if (!variables.apiKey) {
    console.log(`Skipping ${provider} as API key is not provided`);
    continue;
  }

  if (config.chatComplete) {
    describe(`${provider} /chat/completions endpoint tests:`, () =>
      executeChatCompletionEndpointTests(provider, variables));
  }
}

import testCreds from './.creds.json';
import { handler as validateProjectHandler } from './validateProject';
import {
  createChatCompleteRequestContext,
  mockPluginHandlerOptions,
} from '../testUtils';

function getParameters() {
  return {
    credentials: testCreds,
    projectID: testCreds.projectID,
  };
}

describe('validateProject handler', () => {
  it('should fail if the apiKey is invalid', async () => {
    const eventType = 'beforeRequestHook';
    const context = createChatCompleteRequestContext(
      'this is a test string for moderations'
    );
    const parameters = JSON.parse(JSON.stringify(getParameters()));
    parameters.credentials.apiKey = 'invalid-api-key';

    const result = await validateProjectHandler(
      context,
      parameters,
      eventType,
      mockPluginHandlerOptions
    );
    console.log(result);
    expect(result).toBeDefined();
    expect(result.verdict).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.data).toBeNull();
  });
});

import { HookEventType, PluginContext, PluginParameters } from '../types';
import { pluginHandler } from './index';
import testCreds from './.creds.json';
import { BedrockParameters } from './type';
import parametersCreds from './.parameters.json';

/**
 * @example Parameters object
 * 
 * {
    "credentials": {
      "awsAccessKeyId": "keyId",
      "awsSecretAccessKey": "keysecret",
      "awsRegion": "us-east-1"
    },
    "guardrailId": "xyxyxyx",
    "guardrailVersion": "1"
  * }
 */
describe('Credentials check', () => {
  test('Should fail withuout accessKey or accessKeySecret', async () => {
    const context = {
      request: {
        text: 'My email is abc@xyz.com and SSN is 123-45-6789',
        json: {
          messages: [
            {
              role: 'user',
              content: 'My email is abc@xyz.com and SSN is 123-45-6789',
            },
          ],
        },
      },
      requestType: 'chatComplete',
    };
    const parameters: PluginParameters<BedrockParameters['credentials']> = {
      credentials: {
        awsAccessKeyId: '',
        awsSecretAccessKey: '',
        awsRegion: '',
      },
      guardrailId: '',
      guardrailVersion: '',
    };

    const result = await pluginHandler(
      context as unknown as PluginContext,
      parameters,
      'beforeRequestHook',
      { env: {} }
    );

    expect(result).toBeDefined();
    expect(result.verdict).toBe(true);
    expect(result.error).toBeDefined();
    expect(result.data).toBeNull();
    expect(result.transformed).toBe(false);
  });

  test('Should fail with wrong creds', async () => {
    const context = {
      request: {
        text: 'My email is abc@xyz.com and SSN is 123-45-6789',
        json: {
          messages: [
            {
              role: 'user',
              content: 'My email is abc@xyz.com and SSN is 123-45-6789',
            },
          ],
        },
      },
      requestType: 'chatComplete',
    };
    const parameters: PluginParameters<BedrockParameters['credentials']> = {
      credentials: {
        awsAccessKeyId: 'accessKeyID',
        awsRegion: 'us-east-1',
        awsSecretAccessKey: 'accessKeySecret',
      },
      guardrailId: 'guardrailID',
      guardrailVersion: 'guardrailVersion',
    };

    const result = await pluginHandler(
      context as unknown as PluginContext,
      parameters,
      'beforeRequestHook',
      { env: {} }
    );

    expect(result).toBeDefined();
    expect(result.verdict).toBe(true);
    expect(result.error).toBeDefined();
    expect(result.data).toBeNull();
    expect(result.transformed).toBe(false);
  });

  it('should only detect PII', async () => {
    const eventType = 'beforeRequestHook' as HookEventType;
    const context = {
      request: {
        text: 'My email is abc@xyz.com and SSN is 123-45-6789',
        json: {
          messages: [
            {
              role: 'user',
              content: 'My email is abc@xyz.com and SSN is 123-45-6789',
            },
          ],
        },
      },
      requestType: 'chatComplete',
    };
    const parameters = {
      credentials: testCreds as BedrockParameters['credentials'],
      guardrailId: parametersCreds.guardrailId,
      guardrailVersion: parametersCreds.guardrailVersion,
    };

    const result = await pluginHandler(
      context as PluginContext,
      parameters,
      eventType,
      {
        env: {},
      }
    );
    expect(result).toBeDefined();
    expect(result.verdict).toBe(false);
    expect(result.error).toBeNull();
    expect(result.data).toBeDefined();
    expect(result.transformedData?.request?.json).toBeNull();
    expect(result.transformed).toBe(false);
  });

  it('should detect and redact PII in request text', async () => {
    const context = {
      request: {
        text: 'My SSN is 123-45-6789 and some random text',
        json: {
          messages: [
            {
              role: 'user',
              content: 'My SSN is 123-45-6789 and some random text',
            },
          ],
        },
      },
      requestType: 'chatComplete',
    };
    const parameters = {
      credentials: testCreds as BedrockParameters['credentials'],
      redact: true,
      guardrailId: parametersCreds.guardrailId,
      guardrailVersion: parametersCreds.guardrailVersion,
    };

    const result = await pluginHandler(
      context as PluginContext,
      parameters,
      'beforeRequestHook',
      {
        env: {},
      }
    );
    expect(result.error).toBeNull();
    expect(result.verdict).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.transformedData?.request?.json?.messages?.[0]?.content).toBe(
      'My SSN is {US_SOCIAL_SECURITY_NUMBER} and some random text'
    );
    expect(result.transformed).toBe(true);
  });

  it('should detect and redact PII in request text with multiple content parts', async () => {
    const context = {
      request: {
        text: 'My SSN is 123-45-6789 My SSN is 123-45-6789 and some random text',
        json: {
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'My SSN is 123-45-6789',
                },
                {
                  type: 'text',
                  text: 'My SSN is 123-45-6789 and some random text',
                },
              ],
            },
          ],
        },
      },
      requestType: 'chatComplete',
    };
    const parameters = {
      credentials: testCreds as BedrockParameters['credentials'],
      redact: true,
      guardrailId: parametersCreds.guardrailId,
      guardrailVersion: parametersCreds.guardrailVersion,
    };

    const result = await pluginHandler(
      context as PluginContext,
      parameters,
      'beforeRequestHook',
      {
        env: {},
      }
    );

    expect(result.error).toBeNull();
    expect(result.verdict).toBe(true);
    expect(result.data).toBeDefined;
    expect(
      result.transformedData?.request?.json?.messages?.[0]?.content?.[0]?.text
    ).toBe('My SSN is {US_SOCIAL_SECURITY_NUMBER}');
    expect(
      result.transformedData?.request?.json?.messages?.[0]?.content?.[1]?.text
    ).toBe('My SSN is {US_SOCIAL_SECURITY_NUMBER} and some random text');
    expect(result.transformed).toBe(true);
  });

  it('should detect and redact PII in response text', async () => {
    const context = {
      response: {
        text: 'My SSN is 123-45-6789 and some random text',
        json: {
          choices: [
            {
              message: {
                role: 'assistant',
                content: 'My SSN is 123-45-6789 and some random text',
              },
            },
          ],
        },
      },
      requestType: 'chatComplete',
    };
    const parameters = {
      credentials: testCreds as BedrockParameters['credentials'],
      redact: true,
      guardrailId: parametersCreds.guardrailId,
      guardrailVersion: parametersCreds.guardrailVersion,
    };

    const result = await pluginHandler(
      context as PluginContext,
      parameters,
      'afterRequestHook',
      {
        env: {},
      }
    );

    expect(result.error).toBeNull();
    expect(result.verdict).toBe(true);
    expect(result.data).toBeDefined();
    expect(
      result.transformedData?.response?.json?.choices?.[0]?.message?.content
    ).toBe('My SSN is {US_SOCIAL_SECURITY_NUMBER} and some random text');
    expect(result.transformed).toBe(true);
  });

  it('should pass text without PII', async () => {
    const eventType = 'afterRequestHook' as HookEventType;
    const context = {
      response: {
        text: 'Hello world',
        json: {
          choices: [
            {
              message: {
                role: 'assistant',
                content: 'Hello world',
              },
            },
          ],
        },
      },
      requestType: 'chatComplete',
    };
    const parameters = {
      credentials: testCreds as BedrockParameters['credentials'],
      guardrailId: parametersCreds.guardrailId,
      guardrailVersion: parametersCreds.guardrailVersion,
    };

    const result = await pluginHandler(
      context as PluginContext,
      parameters,
      eventType,
      {
        env: {},
      }
    );
    expect(result).toBeDefined();
    expect(result.verdict).toBe(true);
    expect(result.error).toBeNull();
    expect(result.data).toBeDefined();
    expect(result.transformedData?.response?.json).toBeNull();
    expect(result.transformed).toBe(false);
  });
});

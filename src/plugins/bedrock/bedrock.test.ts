import { PluginParameters } from '../types';
import { pluginHandler } from './index';
import testCreds from './.creds.json';
import { BedrockParameters } from './type';
import parametersCreds from './.parameters.json';
import {
  mockPluginHandlerOptions,
  createChatCompleteRequestContext,
  createChatCompleteResponseContext,
} from '../testUtils';

/**
 * @example Parameters object
 * 
 * {
    "credentials": {
      "accessKeyId": "keyId",
      "accessKeySecret": "keysecret",
      "awsRegion": "us-east-1"
    },
    "guardrailId": "xyxyxyx",
    "guardrailVersion": "1"
  * }
 */
describe('Credentials check', () => {
  const piiRequestContext = createChatCompleteRequestContext(
    'My email is abc@xyz.com and SSN is 123-45-6789'
  );

  test('Should fail withuout accessKey or accessKeySecret', async () => {
    const parameters: PluginParameters<BedrockParameters['credentials']> = {
      credentials: {
        awsAccessKeyId: '',
        awsSecretAccessKey: '',
        awsRegion: '',
        awsAuthType: 'accessKey',
      },
      guardrailId: '',
      guardrailVersion: '',
    };

    const result = await pluginHandler(
      piiRequestContext,
      parameters,
      'beforeRequestHook',
      mockPluginHandlerOptions
    );

    expect(result).toBeDefined();
    expect(result.verdict).toBe(true);
    expect(result.error).toBeDefined();
    expect(result.data).toBeNull();
    expect(result.transformed).toBe(false);
  });

  test('Should fail with wrong creds', async () => {
    const parameters: PluginParameters<BedrockParameters['credentials']> = {
      credentials: {
        awsAccessKeyId: 'accessKeyID',
        awsRegion: 'us-east-1',
        awsSecretAccessKey: 'accessKeySecret',
        awsAuthType: 'accessKey',
      },
      guardrailId: 'guardrailID',
      guardrailVersion: 'guardrailVersion',
    };

    const result = await pluginHandler(
      piiRequestContext,
      parameters,
      'beforeRequestHook',
      mockPluginHandlerOptions
    );

    expect(result).toBeDefined();
    expect(result.verdict).toBe(true);
    expect(result.error).toBeDefined();
    expect(result.data).toBeNull();
    expect(result.transformed).toBe(false);
  });

  it('should only detect PII', async () => {
    const parameters = {
      credentials: testCreds as BedrockParameters['credentials'],
      guardrailId: parametersCreds.guardrailId,
      guardrailVersion: parametersCreds.guardrailVersion,
    };

    const result = await pluginHandler(
      piiRequestContext,
      parameters,
      'beforeRequestHook',
      mockPluginHandlerOptions
    );
    expect(result).toBeDefined();
    expect(result.verdict).toBe(false);
    expect(result.error).toBeNull();
    expect(result.data).toBeDefined();
    expect(result.transformedData?.request?.json).toBeNull();
    expect(result.transformed).toBe(false);
  });

  it('should detect and redact PII in request text', async () => {
    const ssnRequestContext = createChatCompleteRequestContext(
      'My SSN is 123-45-6789 and some random text'
    );
    const parameters = {
      credentials: testCreds as BedrockParameters['credentials'],
      redact: true,
      guardrailId: parametersCreds.guardrailId,
      guardrailVersion: parametersCreds.guardrailVersion,
    };

    const result = await pluginHandler(
      ssnRequestContext,
      parameters,
      'beforeRequestHook',
      mockPluginHandlerOptions
    );
    expect(result.error).toBeNull();
    expect(result.verdict).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.transformedData?.request?.json?.messages?.[0]?.content).toBe(
      'My SSN is {US_SOCIAL_SECURITY_NUMBER}{SSN_REGEX} and some random text'
    );
    expect(result.transformed).toBe(true);
  });

  it('should detect and redact PII in request text with multiple content parts', async () => {
    const multiPartContext = createChatCompleteRequestContext('', {
      request: {
        json: {
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: 'My SSN is 123-45-6789' },
                {
                  type: 'text',
                  text: 'My SSN is 123-45-6789 and some random text',
                },
              ],
            },
          ],
        },
      },
    });
    const parameters = {
      credentials: testCreds as BedrockParameters['credentials'],
      redact: true,
      guardrailId: parametersCreds.guardrailId,
      guardrailVersion: parametersCreds.guardrailVersion,
    };

    const result = await pluginHandler(
      multiPartContext,
      parameters,
      'beforeRequestHook',
      mockPluginHandlerOptions
    );

    expect(result.error).toBeNull();
    expect(result.verdict).toBe(true);
    expect(result.data).toBeDefined;
    expect(
      result.transformedData?.request?.json?.messages?.[0]?.content?.[0]?.text
    ).toBe('My SSN is {US_SOCIAL_SECURITY_NUMBER}{SSN_REGEX}');
    expect(
      result.transformedData?.request?.json?.messages?.[0]?.content?.[1]?.text
    ).toBe(
      'My SSN is {US_SOCIAL_SECURITY_NUMBER}{SSN_REGEX} and some random text'
    );
    expect(result.transformed).toBe(true);
  });

  it('should detect and redact PII in response text', async () => {
    const ssnResponseContext = createChatCompleteResponseContext(
      'My SSN is 123-45-6789 and some random text'
    );
    const parameters = {
      credentials: testCreds as BedrockParameters['credentials'],
      redact: true,
      guardrailId: parametersCreds.guardrailId,
      guardrailVersion: parametersCreds.guardrailVersion,
    };

    const result = await pluginHandler(
      ssnResponseContext,
      parameters,
      'afterRequestHook',
      mockPluginHandlerOptions
    );

    expect(result.error).toBeNull();
    expect(result.verdict).toBe(true);
    expect(result.data).toBeDefined();
    expect(
      result.transformedData?.response?.json?.choices?.[0]?.message?.content
    ).toBe(
      'My SSN is {US_SOCIAL_SECURITY_NUMBER}{SSN_REGEX} and some random text'
    );
    expect(result.transformed).toBe(true);
  });

  it('should pass text without PII', async () => {
    const helloResponseContext =
      createChatCompleteResponseContext('Hello world');
    const parameters = {
      credentials: testCreds as BedrockParameters['credentials'],
      guardrailId: parametersCreds.guardrailId,
      guardrailVersion: parametersCreds.guardrailVersion,
    };

    const result = await pluginHandler(
      helloResponseContext,
      parameters,
      'afterRequestHook',
      mockPluginHandlerOptions
    );
    expect(result).toBeDefined();
    expect(result.verdict).toBe(true);
    expect(result.error).toBeNull();
    expect(result.transformedData?.response?.json).toBeNull();
    expect(result.transformed).toBe(false);
  });
});

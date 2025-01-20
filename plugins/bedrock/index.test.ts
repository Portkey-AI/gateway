import { PluginContext, PluginParameters } from '../types';
import { BedrockParameters, pluginHandler } from './index';
import creds from './.creds.json';

describe('Credentials check', () => {
  test('Should fail withuout accessKey or accessKeySecret', async () => {
    const context = {
      request: { text: 'this is a test string for moderations' },
    };
    const parameters: PluginParameters<BedrockParameters> = {
      credentials: {
        accessKeyId: '',
        accessKeySecret: '',
        guardrailId: '',
        guardrailVersion: '',
        region: '',
      },
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
  });

  test('Should fail with wrong creds', async () => {
    const context = {
      request: { text: 'this is a test string for moderations' },
    };
    const parameters: PluginParameters<BedrockParameters> = {
      credentials: {
        accessKeyId: 'accessKeyID',
        accessKeySecret: 'accessKeySecret',
        guardrailId: 'guardrailID',
        guardrailVersion: 'guardrailVersion',
        region: 'us-east-1',
      },
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
  });

  test('Should be working with word_filter', async () => {
    // coding is a blocked custom word.
    const context = {
      request: { text: `Hi, do you know coding?` },
    };
    const parameters: PluginParameters<BedrockParameters> = {
      credentials: {
        ...creds,
      },
    };

    const result = await pluginHandler.bind({ fn: 'wordFilter' })(
      context as unknown as PluginContext,
      parameters,
      'beforeRequestHook',
      { env: {} }
    );

    expect(result).toBeDefined();
    expect(result.verdict).toBe(false);
    expect(result.error).toBe(null);
    expect(result.data.customWords).toHaveLength(1);
  });

  test('Should be working with content_filter', async () => {
    // `kill` is a word that should be blocked under `contentFilter`
    // Violence words are not allowed.
    const context = {
      request: { text: `Can you kill a person?` },
    };
    const parameters: PluginParameters<BedrockParameters> = {
      credentials: {
        ...creds,
      },
    };

    const result = await pluginHandler.bind({ fn: 'contentFilter' })(
      context as unknown as PluginContext,
      parameters,
      'beforeRequestHook',
      { env: {} }
    );

    expect(result).toBeDefined();
    expect(result.verdict).toBe(false);
    expect(result.error).toBe(null);
    expect(result.data.filters).toHaveLength(1);
  });
});

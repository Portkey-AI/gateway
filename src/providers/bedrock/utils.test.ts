// Mock modules that have runtime dependencies incompatible with jest
jest.mock('../../apm', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../../utils/env', () => ({
  Environment: jest.fn(() => ({})),
}));

jest.mock('../../utils/fetch', () => ({
  externalServiceFetch: jest.fn(),
}));

jest.mock('../../utils/awsAuth', () => ({
  awsEndpointDomain: 'amazonaws.com',
  generateAWSHeaders: jest.fn(),
  getRegionFromEnv: jest.fn(),
  fetchECSContainerCredentials: jest.fn(),
  fetchECSRegionFromMetadata: jest.fn(),
  fetchECSTaskRoleArnFromMetadata: jest.fn(),
  fetchIMDSAllCredentials: jest.fn(),
  fetchPodIdentityCredentials: jest.fn(),
  fetchSTSAssumeRoleCredentials: jest.fn(),
  fetchWebIdentityCredentials: jest.fn(),
  getCredentialsFromAwsConfigFile: jest.fn(),
  getCredentialsFromEnvironment: jest.fn(),
  getCredentialsFromSharedCredentialsFile: jest.fn(),
}));

jest.mock('../../services/cache/cacheService', () => ({
  requestCache: jest.fn(() => ({
    get: jest.fn(),
    set: jest.fn(),
  })),
}));

jest.mock('hono/adapter', () => ({
  env: jest.fn(),
  getRuntimeKey: jest.fn(() => 'node'),
}));

import {
  transformAdditionalModelRequestFields,
  transformOutputConfig,
} from './utils';
import { BedrockChatCompletionsParams } from './chatComplete';

describe('transformOutputConfig', () => {
  it('maps json_schema response_format to Bedrock outputConfig', () => {
    const params = {
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'MySchema',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              age: { type: 'integer' },
            },
            required: ['name', 'age'],
          },
        },
      },
    } as unknown as BedrockChatCompletionsParams;

    const result = transformOutputConfig(params);

    expect(result).toEqual({
      textFormat: {
        type: 'json_schema',
        structure: {
          jsonSchema: {
            schema: JSON.stringify({
              type: 'object',
              properties: {
                name: { type: 'string' },
                age: { type: 'integer' },
              },
              required: ['name', 'age'],
            }),
            name: 'MySchema',
          },
        },
      },
    });
  });

  it('stringifies schema when provided as object', () => {
    const schemaObj = {
      type: 'object',
      properties: { x: { type: 'number' } },
    };
    const params = {
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'Test',
          schema: schemaObj,
        },
      },
    } as unknown as BedrockChatCompletionsParams;

    const result = transformOutputConfig(params);
    expect(typeof result?.textFormat.structure.jsonSchema.schema).toBe(
      'string'
    );
    expect(JSON.parse(result!.textFormat.structure.jsonSchema.schema)).toEqual(
      schemaObj
    );
  });

  it('passes through schema when already a string', () => {
    const schemaStr = '{"type":"object"}';
    const params = {
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'Test',
          schema: schemaStr,
        },
      },
    } as unknown as BedrockChatCompletionsParams;

    const result = transformOutputConfig(params);
    expect(result?.textFormat.structure.jsonSchema.schema).toBe(schemaStr);
  });

  it('defaults name to "response" when not provided', () => {
    const params = {
      response_format: {
        type: 'json_schema',
        json_schema: {
          schema: { type: 'object' },
        },
      },
    } as unknown as BedrockChatCompletionsParams;

    const result = transformOutputConfig(params);
    expect(result?.textFormat.structure.jsonSchema.name).toBe('response');
  });

  it('passes through description when provided', () => {
    const params = {
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'MySchema',
          description: 'A schema for structured review output',
          schema: { type: 'object' },
        },
      },
    } as unknown as BedrockChatCompletionsParams;

    const result = transformOutputConfig(params);
    expect(result?.textFormat.structure.jsonSchema.description).toBe(
      'A schema for structured review output'
    );
  });

  it('omits description when not provided', () => {
    const params = {
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'Test',
          schema: { type: 'object' },
        },
      },
    } as unknown as BedrockChatCompletionsParams;

    const result = transformOutputConfig(params);
    expect(result?.textFormat.structure.jsonSchema).not.toHaveProperty(
      'description'
    );
  });

  it('returns undefined when schema is missing from json_schema', () => {
    const params = {
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'Test',
        },
      },
    } as unknown as BedrockChatCompletionsParams;

    expect(transformOutputConfig(params)).toBeUndefined();
  });

  it('returns undefined for json_object type (not supported by Bedrock)', () => {
    const params = {
      response_format: {
        type: 'json_object',
      },
    } as unknown as BedrockChatCompletionsParams;

    expect(transformOutputConfig(params)).toBeUndefined();
  });

  it('returns undefined for text type', () => {
    const params = {
      response_format: {
        type: 'text',
      },
    } as unknown as BedrockChatCompletionsParams;

    expect(transformOutputConfig(params)).toBeUndefined();
  });

  it('returns undefined when response_format is not present', () => {
    const params = {} as unknown as BedrockChatCompletionsParams;
    expect(transformOutputConfig(params)).toBeUndefined();
  });

  it('returns undefined when json_schema property is missing', () => {
    const params = {
      response_format: {
        type: 'json_schema',
      },
    } as unknown as BedrockChatCompletionsParams;

    expect(transformOutputConfig(params)).toBeUndefined();
  });
});

describe('transformAdditionalModelRequestFields', () => {
  it('does not include response_format in additionalModelRequestFields', () => {
    const params = {
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'Test',
          schema: { type: 'object' },
        },
      },
    } as unknown as BedrockChatCompletionsParams;

    const result = transformAdditionalModelRequestFields(params);
    expect(result['response_format']).toBeUndefined();
  });

  it('still passes through top_k', () => {
    const params = {
      top_k: 50,
    } as unknown as BedrockChatCompletionsParams;

    const result = transformAdditionalModelRequestFields(params);
    expect(result['top_k']).toBe(50);
  });

  it('preserves user-provided additionalModelRequestFields', () => {
    const params = {
      additionalModelRequestFields: {
        custom_param: 'value',
      },
    } as unknown as BedrockChatCompletionsParams;

    const result = transformAdditionalModelRequestFields(params);
    expect(result['custom_param']).toBe('value');
  });
});

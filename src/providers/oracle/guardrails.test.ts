import {
  OracleGuardrailsConfig,
  OracleGuardrailsResponseTransform,
  OracleGuardrailsResponse,
  OracleGuardrailsErrorResponse,
} from './guardrails';
import { Params } from '../../types/requestBody';
import { ParameterConfig } from '../types';

// Helper to get single ParameterConfig from possibly array type
const getConfig = (
  config: ParameterConfig | ParameterConfig[]
): ParameterConfig => {
  return Array.isArray(config) ? config[0] : config;
};

describe('Oracle Guardrails', () => {
  describe('OracleGuardrailsConfig', () => {
    describe('input transform', () => {
      it('should transform string input to Oracle format', () => {
        const params = { input: 'Test content for moderation' } as Params;
        const inputConfig = getConfig(OracleGuardrailsConfig.input);
        const result = inputConfig.transform!(params, {} as any);
        expect(result).toEqual({
          type: 'TEXT',
          content: 'Test content for moderation',
        });
      });

      it('should transform array input to joined string', () => {
        const params = {
          input: ['First message', 'Second message'],
        } as unknown as Params;
        const inputConfig = getConfig(OracleGuardrailsConfig.input);
        const result = inputConfig.transform!(params, {} as any);
        expect(result).toEqual({
          type: 'TEXT',
          content: 'First message\nSecond message',
        });
      });
    });

    describe('model transform (compartmentId and guardrailConfigs)', () => {
      it('should extract compartmentId from provider options', () => {
        const params = { model: 'text-moderation-latest' } as Params;
        const providerOptions = {
          oracleCompartmentId: 'ocid1.compartment.oc1..test',
        };
        const modelConfigs = OracleGuardrailsConfig.model as ParameterConfig[];
        const result = modelConfigs[0].transform!(
          params,
          providerOptions as any
        );
        expect(result).toBe('ocid1.compartment.oc1..test');
      });

      it('should generate default guardrail configs when none specified', () => {
        const params = {} as Params;
        const modelConfigs = OracleGuardrailsConfig.model as ParameterConfig[];
        const result = modelConfigs[1].transform!(params, {} as any);
        expect(result).toHaveProperty('contentModerationConfig');
        expect(result).toHaveProperty(
          'personallyIdentifiableInformationConfig'
        );
        expect(result).toHaveProperty('promptInjectionConfig');
      });

      it('should generate configs for specific guardrail types', () => {
        const params = {
          guardrail_types: ['content_moderation', 'pii'],
        } as unknown as Params;
        const modelConfigs = OracleGuardrailsConfig.model as ParameterConfig[];
        const result = modelConfigs[1].transform!(params, {} as any);
        expect(result).toHaveProperty('contentModerationConfig');
        expect(result).toHaveProperty(
          'personallyIdentifiableInformationConfig'
        );
        expect(result).not.toHaveProperty('promptInjectionConfig');
      });

      it('should allow custom PII types', () => {
        const params = {
          guardrail_types: ['pii'],
          pii_types: ['EMAIL', 'PHONE_NUMBER'],
        } as unknown as Params;
        const modelConfigs = OracleGuardrailsConfig.model as ParameterConfig[];
        const result = modelConfigs[1].transform!(params, {} as any);
        expect(result.personallyIdentifiableInformationConfig.types).toEqual([
          'EMAIL',
          'PHONE_NUMBER',
        ]);
      });
    });
  });

  describe('OracleGuardrailsResponseTransform', () => {
    it('should transform successful response with content moderation', () => {
      const mockResponse: OracleGuardrailsResponse = {
        results: {
          'content-moderation': {
            categories: [
              { name: 'OVERALL', score: 0.8 },
              { name: 'VIOLENCE', score: 0.7 },
              { name: 'HATE', score: 0.1 },
            ],
          },
          'personally-identifiable-information': null,
          'prompt-injection': null,
        },
      };

      const result = OracleGuardrailsResponseTransform(
        mockResponse,
        200,
        new Headers()
      );

      expect(result.id).toMatch(/^modr-\d+$/);
      expect(result.model).toBe('oracle-guardrails');
      expect(result.results).toHaveLength(1);
      expect(result.results[0].flagged).toBe(true); // OVERALL > 0.5
      expect(result.results[0].category_scores).toHaveProperty('violence', 0.7);
      expect(result.results[0].categories).toHaveProperty('violence', true);
    });

    it('should detect PII in response', () => {
      const mockResponse: OracleGuardrailsResponse = {
        results: {
          'content-moderation': {
            categories: [
              { name: 'OVERALL', score: 0.0 },
              { name: 'BLOCKLIST', score: 0.0 },
            ],
          },
          'personally-identifiable-information': [
            {
              label: 'EMAIL',
              text: 'test@example.com',
              offset: 10,
              length: 16,
              score: 0.95,
            },
          ],
          'prompt-injection': null,
        },
      };

      const result = OracleGuardrailsResponseTransform(
        mockResponse,
        200,
        new Headers()
      );

      expect(result.results[0].flagged).toBe(true); // Has PII
      expect(result.results[0].categories['pii-detected']).toBe(true);
      expect(result.results[0].oracle_details.pii_detection).toHaveLength(1);
    });

    it('should detect prompt injection', () => {
      const mockResponse: OracleGuardrailsResponse = {
        results: {
          'content-moderation': {
            categories: [
              { name: 'OVERALL', score: 0.0 },
              { name: 'BLOCKLIST', score: 0.0 },
            ],
          },
          'personally-identifiable-information': null,
          'prompt-injection': {
            score: 1.0,
          },
        },
      };

      const result = OracleGuardrailsResponseTransform(
        mockResponse,
        200,
        new Headers()
      );

      expect(result.results[0].flagged).toBe(true);
      expect(result.results[0].categories['prompt-injection']).toBe(true);
      expect(result.results[0].category_scores['prompt-injection']).toBe(1.0);
    });

    it('should not flag safe content', () => {
      const mockResponse: OracleGuardrailsResponse = {
        results: {
          'content-moderation': {
            categories: [
              { name: 'OVERALL', score: 0.1 },
              { name: 'BLOCKLIST', score: 0.0 },
            ],
          },
          'personally-identifiable-information': null,
          'prompt-injection': {
            score: 0.1,
          },
        },
      };

      const result = OracleGuardrailsResponseTransform(
        mockResponse,
        200,
        new Headers()
      );

      expect(result.results[0].flagged).toBe(false);
    });

    it('should handle error response', () => {
      const mockErrorResponse: OracleGuardrailsErrorResponse = {
        code: 400,
        message: 'Invalid request: missing compartmentId',
      };

      const result = OracleGuardrailsResponseTransform(
        mockErrorResponse,
        400,
        new Headers()
      );

      expect(result.error).toBeDefined();
      expect(result.error.message).toContain('Invalid request');
      expect(result.provider).toBe('oracle');
    });

    it('should handle error response with missing message', () => {
      const mockErrorResponse: OracleGuardrailsErrorResponse = {
        code: 500,
        message: '',
      };

      const result = OracleGuardrailsResponseTransform(
        mockErrorResponse,
        500,
        new Headers()
      );

      expect(result.error).toBeDefined();
      expect(result.error.message).toContain('Unknown error');
    });

    it('should include oracle_details in response', () => {
      const mockResponse: OracleGuardrailsResponse = {
        results: {
          'content-moderation': {
            categories: [{ name: 'OVERALL', score: 0.0 }],
          },
          'personally-identifiable-information': [
            {
              label: 'SSN',
              text: '123-45-6789',
              offset: 0,
              length: 11,
              score: 0.99,
            },
          ],
          'prompt-injection': { score: 0.5 },
        },
      };

      const result = OracleGuardrailsResponseTransform(
        mockResponse,
        200,
        new Headers()
      );

      expect(result.results[0].oracle_details).toBeDefined();
      expect(result.results[0].oracle_details.content_moderation).toBeDefined();
      expect(result.results[0].oracle_details.pii_detection).toHaveLength(1);
      expect(result.results[0].oracle_details.prompt_injection).toEqual({
        score: 0.5,
      });
    });
  });
});

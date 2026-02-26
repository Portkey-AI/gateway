import {
  OracleRerankConfig,
  OracleRerankResponseTransform,
  OracleRerankResponse,
  OracleRerankErrorResponse,
} from './rerank';
import { Params } from '../../types/requestBody';
import { ParameterConfig } from '../types';

// Helper to get single ParameterConfig from possibly array type
const getConfig = (
  config: ParameterConfig | ParameterConfig[]
): ParameterConfig => {
  return Array.isArray(config) ? config[0] : config;
};

describe('Oracle Rerank', () => {
  describe('OracleRerankConfig', () => {
    describe('input transform', () => {
      it('should transform query to input', () => {
        const params = { query: 'What is machine learning?' } as Params;
        const inputConfig = getConfig(OracleRerankConfig.input);
        const result = inputConfig.transform!(params, {} as any);
        expect(result).toBe('What is machine learning?');
      });

      it('should handle undefined query', () => {
        const params = {} as Params;
        const inputConfig = getConfig(OracleRerankConfig.input);
        const result = inputConfig.transform!(params, {} as any);
        expect(result).toBeUndefined();
      });
    });

    describe('documents transform', () => {
      it('should transform string array documents', () => {
        const params = {
          documents: ['Document 1', 'Document 2', 'Document 3'],
        } as Params;
        const docsConfig = getConfig(OracleRerankConfig.documents);
        const result = docsConfig.transform!(params, {} as any);
        expect(result).toEqual(['Document 1', 'Document 2', 'Document 3']);
      });

      it('should transform object array documents with text property', () => {
        const params = {
          documents: [
            { text: 'Document 1' },
            { text: 'Document 2' },
            { text: 'Document 3' },
          ],
        } as Params;
        const docsConfig = getConfig(OracleRerankConfig.documents);
        const result = docsConfig.transform!(params, {} as any);
        expect(result).toEqual(['Document 1', 'Document 2', 'Document 3']);
      });

      it('should handle mixed document types', () => {
        const params = {
          documents: ['Document 1', { text: 'Document 2' }, 'Document 3'],
        } as Params;
        const docsConfig = getConfig(OracleRerankConfig.documents);
        const result = docsConfig.transform!(params, {} as any);
        expect(result).toEqual(['Document 1', 'Document 2', 'Document 3']);
      });

      it('should return empty array for undefined documents', () => {
        const params = {} as Params;
        const docsConfig = getConfig(OracleRerankConfig.documents);
        const result = docsConfig.transform!(params, {} as any);
        expect(result).toEqual([]);
      });
    });

    describe('model transform (servingMode)', () => {
      it('should transform model to servingMode with ON_DEMAND default', () => {
        const params = { model: 'cohere.rerank-v3.5' } as Params;
        const providerOptions = { oracleCompartmentId: 'test-compartment' };
        const modelConfigs = OracleRerankConfig.model as ParameterConfig[];
        const result = modelConfigs[0].transform!(
          params,
          providerOptions as any
        );
        expect(result).toEqual({
          servingType: 'ON_DEMAND',
          modelId: 'cohere.rerank-v3.5',
        });
      });

      it('should use custom servingMode when provided', () => {
        const params = { model: 'cohere.rerank-v3.5' } as Params;
        const providerOptions = {
          oracleServingMode: 'DEDICATED',
          oracleCompartmentId: 'test-compartment',
        };
        const modelConfigs = OracleRerankConfig.model as ParameterConfig[];
        const result = modelConfigs[0].transform!(
          params,
          providerOptions as any
        );
        expect(result).toEqual({
          servingType: 'DEDICATED',
          modelId: 'cohere.rerank-v3.5',
        });
      });

      it('should extract compartmentId from provider options', () => {
        const params = { model: 'cohere.rerank-v3.5' } as Params;
        const providerOptions = {
          oracleCompartmentId: 'ocid1.compartment.oc1..test',
        };
        const modelConfigs = OracleRerankConfig.model as ParameterConfig[];
        const result = modelConfigs[1].transform!(
          params,
          providerOptions as any
        );
        expect(result).toBe('ocid1.compartment.oc1..test');
      });
    });

    describe('optional parameters', () => {
      it('should map top_n to topN', () => {
        const topNConfig = getConfig(OracleRerankConfig.top_n);
        expect(topNConfig.param).toBe('topN');
      });

      it('should map return_documents to isEcho', () => {
        const returnDocsConfig = getConfig(OracleRerankConfig.return_documents);
        expect(returnDocsConfig.param).toBe('isEcho');
      });

      it('should map max_chunks_per_doc to maxChunksPerDocument', () => {
        const maxChunksConfig = getConfig(
          OracleRerankConfig.max_chunks_per_doc
        );
        expect(maxChunksConfig.param).toBe('maxChunksPerDocument');
      });
    });
  });

  describe('OracleRerankResponseTransform', () => {
    it('should transform successful response', () => {
      const mockResponse: OracleRerankResponse = {
        modelId: 'cohere.rerank-v3.5',
        modelVersion: '1.0',
        results: [
          { index: 0, relevanceScore: 0.95 },
          { index: 1, relevanceScore: 0.85 },
          { index: 2, relevanceScore: 0.75 },
        ],
      };

      const result = OracleRerankResponseTransform(
        mockResponse,
        200,
        new Headers()
      );

      expect(result.object).toBe('rerank');
      expect(result.model).toBe('cohere.rerank-v3.5');
      expect(result.results).toHaveLength(3);
      expect(result.results[0]).toEqual({
        index: 0,
        relevance_score: 0.95,
      });
      expect(result.results[1]).toEqual({
        index: 1,
        relevance_score: 0.85,
      });
      expect(result.results[2]).toEqual({
        index: 2,
        relevance_score: 0.75,
      });
    });

    it('should include documents when present in response', () => {
      const mockResponse: OracleRerankResponse = {
        modelId: 'cohere.rerank-v3.5',
        modelVersion: '1.0',
        results: [
          { index: 0, relevanceScore: 0.95, document: { text: 'Doc 1' } },
          { index: 1, relevanceScore: 0.85, document: { text: 'Doc 2' } },
        ],
      };

      const result = OracleRerankResponseTransform(
        mockResponse,
        200,
        new Headers()
      );

      expect(result.results[0]).toEqual({
        index: 0,
        relevance_score: 0.95,
        document: { text: 'Doc 1' },
      });
      expect(result.results[1]).toEqual({
        index: 1,
        relevance_score: 0.85,
        document: { text: 'Doc 2' },
      });
    });

    it('should handle error response', () => {
      const mockErrorResponse: OracleRerankErrorResponse = {
        code: 400,
        message: 'Invalid request: missing required field',
      };

      const result = OracleRerankResponseTransform(
        mockErrorResponse,
        400,
        new Headers()
      );

      expect(result.error).toBeDefined();
      expect(result.error.message).toContain(
        'Invalid request: missing required field'
      );
      expect(result.error.code).toBe('400');
      expect(result.provider).toBe('oracle');
    });

    it('should handle error response with missing message', () => {
      const mockErrorResponse: OracleRerankErrorResponse = {
        code: 500,
        message: '',
      };

      const result = OracleRerankResponseTransform(
        mockErrorResponse,
        500,
        new Headers()
      );

      expect(result.error).toBeDefined();
      expect(result.error.message).toContain('Unknown error');
      expect(result.provider).toBe('oracle');
    });

    it('should generate unique id for each response', () => {
      const mockResponse: OracleRerankResponse = {
        modelId: 'cohere.rerank-v3.5',
        modelVersion: '1.0',
        results: [],
      };

      const result1 = OracleRerankResponseTransform(
        mockResponse,
        200,
        new Headers()
      );
      const result2 = OracleRerankResponseTransform(
        mockResponse,
        200,
        new Headers()
      );

      expect(result1.id).toMatch(/^rerank-\d+$/);
      expect(result2.id).toMatch(/^rerank-\d+$/);
    });

    it('should handle invalid response format', () => {
      const invalidResponse = { unexpected: 'format' } as any;

      const result = OracleRerankResponseTransform(
        invalidResponse,
        200,
        new Headers()
      );

      expect(result.error).toBeDefined();
      expect(result.provider).toBe('oracle');
    });
  });
});

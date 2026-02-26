/**
 * Integration tests for Oracle GenAI Embeddings.
 *
 * These tests make real API calls to OCI GenAI.
 *
 * Required environment variables:
 * - ORACLE_TENANCY: OCI tenancy OCID
 * - ORACLE_USER: OCI user OCID
 * - ORACLE_FINGERPRINT: API key fingerprint
 * - ORACLE_PRIVATE_KEY: PEM-encoded private key
 * - ORACLE_COMPARTMENT_ID: Compartment OCID
 * - ORACLE_REGION: OCI region (e.g., us-chicago-1)
 *
 * Optional environment variables:
 * - ORACLE_EMBED_MODEL: Embedding model to test (default: cohere.embed-english-v3.0)
 *
 * Run with: npx jest tests/integration/src/providers/oracle/embed --no-cache
 */

import { transformUsingProviderConfig } from '../../../../../src/services/transformToProviderRequest';
import { Options } from '../../../../../src/types/requestBody';
import {
  OracleEmbedConfig,
  OracleEmbedResponseTransform,
  OracleEmbedResponse,
  OracleEmbedErrorResponse,
} from '../../../../../src/providers/oracle/embed';
import { OCIRequestSigner } from '../../../../../src/providers/oracle/utils';

// Extended embed params type for tests (user field is optional for Oracle)
interface TestEmbedParams {
  model: string;
  input: string | string[];
  input_type?: string;
}

// Skip all tests if credentials are not available
const hasCredentials = Boolean(
  process.env.ORACLE_TENANCY &&
    process.env.ORACLE_USER &&
    process.env.ORACLE_FINGERPRINT &&
    process.env.ORACLE_PRIVATE_KEY &&
    process.env.ORACLE_COMPARTMENT_ID &&
    process.env.ORACLE_REGION
);

const describeIfCredentials = hasCredentials ? describe : describe.skip;

// Test configuration
const EMBED_MODEL =
  process.env.ORACLE_EMBED_MODEL || 'cohere.embed-english-v3.0';

const getOracleConfig = (): Options => ({
  provider: 'oracle',
  oracleTenancy: process.env.ORACLE_TENANCY || '',
  oracleUser: process.env.ORACLE_USER || '',
  oracleFingerprint: process.env.ORACLE_FINGERPRINT || '',
  oraclePrivateKey: process.env.ORACLE_PRIVATE_KEY || '',
  oracleCompartmentId: process.env.ORACLE_COMPARTMENT_ID || '',
  oracleRegion: process.env.ORACLE_REGION || 'us-chicago-1',
  oracleServingMode: 'ON_DEMAND',
});

async function makeEmbedRequest(params: TestEmbedParams): Promise<Response> {
  const providerOptions = getOracleConfig();

  // Transform request to Oracle format
  const transformedRequest = transformUsingProviderConfig(
    OracleEmbedConfig,
    params,
    providerOptions
  );

  // Build URL
  const oracleApiVersion = '20231130';
  const baseUrl = `https://inference.generativeai.${providerOptions.oracleRegion}.oci.oraclecloud.com`;
  const endpoint = `/${oracleApiVersion}/actions/embedText`;
  const url = `${baseUrl}${endpoint}`;

  // Sign request
  const signer = new OCIRequestSigner({
    tenancy: providerOptions.oracleTenancy || '',
    user: providerOptions.oracleUser || '',
    fingerprint: providerOptions.oracleFingerprint || '',
    privateKey: providerOptions.oraclePrivateKey || '',
    keyPassphrase: providerOptions.oracleKeyPassphrase,
    region: providerOptions.oracleRegion || '',
  });

  const body = JSON.stringify(transformedRequest);
  const headers = await signer.signRequest('POST', url, body, {});

  // Make request
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body,
  });

  return response;
}

describeIfCredentials('Oracle GenAI Embeddings Integration Tests', () => {
  beforeAll(() => {
    console.log(`Testing embeddings with model: ${EMBED_MODEL}`);
  });

  describe('Basic Embeddings', () => {
    it('should embed a single text string', async () => {
      const params: TestEmbedParams = {
        model: EMBED_MODEL,
        input: 'Hello, world!',
      };

      const response = await makeEmbedRequest(params);

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Embed request failed:', response.status, errorData);
      }
      expect(response.ok).toBe(true);

      const data = (await response.json()) as OracleEmbedResponse;
      const transformed = OracleEmbedResponseTransform(
        data,
        response.status,
        response.headers
      );

      expect(transformed).toHaveProperty('data');
      expect((transformed as any).data).toHaveLength(1);
      expect(Array.isArray((transformed as any).data[0].embedding)).toBe(true);
      expect((transformed as any).data[0].embedding.length).toBeGreaterThan(0);
      console.log(
        `Embedding dimension: ${(transformed as any).data[0].embedding.length}`
      );
    }, 60000);

    it('should embed multiple texts', async () => {
      const params: TestEmbedParams = {
        model: EMBED_MODEL,
        input: ['Hello, world!', 'How are you?', 'Machine learning is great.'],
      };

      const response = await makeEmbedRequest(params);
      expect(response.ok).toBe(true);

      const data = (await response.json()) as OracleEmbedResponse;
      const transformed = OracleEmbedResponseTransform(
        data,
        response.status,
        response.headers
      );

      expect((transformed as any).data).toHaveLength(3);
      expect((transformed as any).data[0].index).toBe(0);
      expect((transformed as any).data[1].index).toBe(1);
      expect((transformed as any).data[2].index).toBe(2);
      console.log(`Embedded ${(transformed as any).data.length} texts`);
    }, 60000);

    it('should return usage information', async () => {
      const params: TestEmbedParams = {
        model: EMBED_MODEL,
        input: 'This is a test sentence for token counting.',
      };

      const response = await makeEmbedRequest(params);
      expect(response.ok).toBe(true);

      const data = (await response.json()) as OracleEmbedResponse;
      const transformed = OracleEmbedResponseTransform(
        data,
        response.status,
        response.headers
      );

      expect((transformed as any).usage).toBeDefined();
      expect((transformed as any).usage.prompt_tokens).toBeGreaterThanOrEqual(
        0
      );
      console.log(`Token usage:`, (transformed as any).usage);
    }, 60000);
  });

  describe('Input Types', () => {
    it('should handle search_document input type', async () => {
      const params: TestEmbedParams = {
        model: EMBED_MODEL,
        input: 'This document describes machine learning concepts.',
        input_type: 'search_document',
      };

      const response = await makeEmbedRequest(params);
      expect(response.ok).toBe(true);

      const data = (await response.json()) as OracleEmbedResponse;
      const transformed = OracleEmbedResponseTransform(
        data,
        response.status,
        response.headers
      );

      expect((transformed as any).data).toHaveLength(1);
      console.log('Search document embedding generated');
    }, 60000);

    it('should handle search_query input type', async () => {
      const params: TestEmbedParams = {
        model: EMBED_MODEL,
        input: 'What is machine learning?',
        input_type: 'search_query',
      };

      const response = await makeEmbedRequest(params);
      expect(response.ok).toBe(true);

      const data = (await response.json()) as OracleEmbedResponse;
      const transformed = OracleEmbedResponseTransform(
        data,
        response.status,
        response.headers
      );

      expect((transformed as any).data).toHaveLength(1);
      console.log('Search query embedding generated');
    }, 60000);
  });

  describe('Error Handling', () => {
    it('should handle invalid model gracefully', async () => {
      const params: TestEmbedParams = {
        model: 'invalid-embed-model',
        input: 'Hello',
      };

      const response = await makeEmbedRequest(params);
      expect(response.ok).toBe(false);

      const data = (await response.json()) as OracleEmbedErrorResponse;
      const transformed = OracleEmbedResponseTransform(
        data,
        response.status,
        response.headers
      );

      expect((transformed as any).error).toBeDefined();
      console.log('Error response:', (transformed as any).error);
    }, 60000);
  });

  describe('Similarity Calculation', () => {
    it('should produce similar embeddings for similar texts', async () => {
      const params: TestEmbedParams = {
        model: EMBED_MODEL,
        input: [
          'The cat sat on the mat.',
          'A cat was sitting on a mat.',
          'Dogs like to play fetch.',
        ],
      };

      const response = await makeEmbedRequest(params);
      expect(response.ok).toBe(true);

      const data = (await response.json()) as OracleEmbedResponse;
      const transformed = OracleEmbedResponseTransform(
        data,
        response.status,
        response.headers
      );

      const embeddings = (transformed as any).data.map((d: any) => d.embedding);

      // Calculate cosine similarity
      const cosineSimilarity = (a: number[], b: number[]): number => {
        let dotProduct = 0;
        let normA = 0;
        let normB = 0;
        for (let i = 0; i < a.length; i++) {
          dotProduct += a[i] * b[i];
          normA += a[i] * a[i];
          normB += b[i] * b[i];
        }
        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
      };

      const sim01 = cosineSimilarity(embeddings[0], embeddings[1]);
      const sim02 = cosineSimilarity(embeddings[0], embeddings[2]);

      console.log(`Similarity (cat sentences): ${sim01.toFixed(4)}`);
      console.log(`Similarity (cat vs dog): ${sim02.toFixed(4)}`);

      // Cat sentences should be more similar to each other than to dog sentence
      expect(sim01).toBeGreaterThan(sim02);
    }, 60000);
  });
});

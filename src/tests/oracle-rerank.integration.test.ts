/**
 * Oracle Rerank Integration Tests
 *
 * NOTE: As of May 2025, all Cohere rerank models (cohere.rerank-v3.5,
 * cohere.rerank-multilingual-v3.1, cohere.rerank-english-v3.1) have been
 * retired for ON_DEMAND serving in OCI GenAI. They are only available
 * via DEDICATED AI clusters.
 *
 * To run these tests, you need:
 * 1. A dedicated AI cluster with RERANK_COHERE shape
 * 2. Set ORACLE_SERVING_MODE=DEDICATED
 * 3. Set ORACLE_ENDPOINT_ID to your dedicated endpoint OCID
 *
 * Run with: npx tsx src/tests/oracle-rerank.integration.test.ts
 */

import { OCIRequestSigner } from '../providers/oracle/utils';
import {
  OracleRerankConfig,
  OracleRerankResponseTransform,
} from '../providers/oracle/rerank';
import { ParameterConfig } from '../providers/types';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// Load OCI config from ~/.oci/config
function loadOCIConfig(profile: string): Record<string, string> {
  const configPath = join(process.env.HOME || '', '.oci', 'config');
  if (!existsSync(configPath)) {
    return {};
  }

  const content = readFileSync(configPath, 'utf8');
  const lines = content.split('\n');
  const config: Record<string, string> = {};
  let inProfile = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('[')) {
      inProfile = trimmed === `[${profile}]`;
      continue;
    }
    if (inProfile && trimmed.includes('=')) {
      const [key, ...valueParts] = trimmed.split('=');
      config[key.trim()] = valueParts.join('=').trim();
    }
  }

  return config;
}

// Load private key from file path
function loadPrivateKey(keyPath: string): string {
  const resolvedPath = keyPath.startsWith('~')
    ? keyPath.replace('~', process.env.HOME || '')
    : keyPath;
  if (existsSync(resolvedPath)) {
    return readFileSync(resolvedPath, 'utf8');
  }
  return keyPath;
}

async function runIntegrationTests() {
  console.log('🧪 Oracle Rerank Integration Tests\n');

  const profile = process.env.OCI_PROFILE || 'LUIGI_FRA_API';
  const region = process.env.ORACLE_REGION || 'eu-frankfurt-1';
  const servingMode = process.env.ORACLE_SERVING_MODE || 'ON_DEMAND';
  const endpointId = process.env.ORACLE_ENDPOINT_ID;

  const ociConfig = loadOCIConfig(profile);
  const config = {
    tenancy: ociConfig.tenancy || '',
    user: ociConfig.user || '',
    fingerprint: ociConfig.fingerprint || '',
    privateKey: loadPrivateKey(ociConfig.key_file || ''),
    region: region,
    compartmentId: process.env.ORACLE_COMPARTMENT_ID || ociConfig.tenancy || '',
  };

  // Validate config
  const missingFields = Object.entries(config)
    .filter(([key, value]) => !value && !['compartmentId'].includes(key))
    .map(([key]) => key);

  if (missingFields.length > 0) {
    console.error('❌ Missing configuration:', missingFields.join(', '));
    process.exit(1);
  }

  console.log(`👤 Profile: ${profile}`);
  console.log(`📍 Region: ${config.region}`);
  console.log(`🔧 Serving Mode: ${servingMode}`);
  if (endpointId) {
    console.log(`📌 Endpoint ID: ${endpointId.substring(0, 40)}...`);
  }
  console.log('');

  // Check if ON_DEMAND (warn about retirement)
  if (servingMode === 'ON_DEMAND') {
    console.log('⚠️  WARNING: Cohere rerank models were retired for ON_DEMAND');
    console.log(
      '   serving in May 2025. These tests will likely fail with 404.'
    );
    console.log(
      '   Use DEDICATED mode with a rerank endpoint for live testing.\n'
    );
  }

  // Run config transformation tests (these always work - no API needed)
  console.log('📝 Config Transformation Tests (no API required)');
  console.log('-'.repeat(50));

  const documents = [
    'Machine learning is a subset of AI.',
    'Deep learning uses neural networks.',
    'NLP processes language.',
    'Computer vision analyzes images.',
  ];

  const params = {
    model: 'cohere.rerank-v3.5',
    query: 'What is machine learning?',
    documents: documents,
    top_n: 3,
    return_documents: true,
  };

  const providerOptions = {
    oracleCompartmentId: config.compartmentId,
    oracleServingMode: servingMode,
  };

  let passed = 0;
  let failed = 0;

  try {
    const inputConfig = OracleRerankConfig.input as ParameterConfig;
    const transformedInput = inputConfig.transform!(
      params,
      providerOptions as any
    );
    console.log(`✅ Input transform: "${transformedInput}"`);
    passed++;

    const docsConfig = OracleRerankConfig.documents as ParameterConfig;
    const transformedDocs = docsConfig.transform!(
      params,
      providerOptions as any
    );
    console.log(`✅ Documents transform: ${transformedDocs.length} documents`);
    passed++;

    const modelConfigs = OracleRerankConfig.model as ParameterConfig[];
    const transformedServingMode = modelConfigs[0].transform!(
      params,
      providerOptions as any
    );
    console.log(
      `✅ ServingMode transform: ${JSON.stringify(transformedServingMode)}`
    );
    passed++;

    const transformedCompartment = modelConfigs[1].transform!(
      params,
      providerOptions as any
    );
    console.log(
      `✅ CompartmentId transform: ${transformedCompartment.substring(0, 40)}...`
    );
    passed++;
  } catch (error: any) {
    console.log(`❌ Config transformation error: ${error.message}`);
    failed++;
  }

  // Test response transformation
  console.log('\n📝 Response Transformation Tests');
  console.log('-'.repeat(50));

  try {
    const mockResponse = {
      modelId: 'cohere.rerank-v3.5',
      modelVersion: '3.5',
      results: [
        { index: 0, relevanceScore: 0.95 },
        { index: 2, relevanceScore: 0.82 },
        { index: 1, relevanceScore: 0.71 },
      ],
    };

    const transformed = OracleRerankResponseTransform(
      mockResponse,
      200,
      new Headers()
    );

    if (
      transformed.object === 'rerank' &&
      transformed.results.length === 3 &&
      transformed.results[0].relevance_score === 0.95
    ) {
      console.log('✅ Response transformation: Success');
      console.log(`   - Model: ${transformed.model}`);
      console.log(`   - Results: ${transformed.results.length} items`);
      console.log(`   - Top score: ${transformed.results[0].relevance_score}`);
      passed++;
    } else {
      throw new Error('Response structure mismatch');
    }
  } catch (error: any) {
    console.log(`❌ Response transformation error: ${error.message}`);
    failed++;
  }

  // Test error response transformation
  try {
    const mockError = {
      code: 400,
      message: 'Invalid request',
    };

    const transformed = OracleRerankResponseTransform(
      mockError,
      400,
      new Headers()
    );

    if (transformed.error && transformed.provider === 'oracle') {
      console.log('✅ Error response transformation: Success');
      passed++;
    } else {
      throw new Error('Error response structure mismatch');
    }
  } catch (error: any) {
    console.log(`❌ Error response transformation error: ${error.message}`);
    failed++;
  }

  // Live API tests (only if DEDICATED mode with endpoint)
  if (servingMode === 'DEDICATED' && endpointId) {
    console.log('\n📝 Live API Tests (DEDICATED mode)');
    console.log('-'.repeat(50));

    const baseUrl = `https://inference.generativeai.${config.region}.oci.oraclecloud.com`;
    const endpoint = '/20231130/actions/rerankText';
    const url = `${baseUrl}${endpoint}`;

    try {
      const signer = new OCIRequestSigner({
        tenancy: config.tenancy,
        user: config.user,
        fingerprint: config.fingerprint,
        privateKey: config.privateKey,
        region: config.region,
      });

      const requestBody = {
        compartmentId: config.compartmentId,
        servingMode: {
          servingType: 'DEDICATED',
          endpointId: endpointId,
        },
        input: 'What is machine learning?',
        documents: documents,
      };

      const body = JSON.stringify(requestBody);
      const headers = await signer.signRequest('POST', url, body, {});

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        },
        body,
      });

      const responseBody = await response.json();

      if (response.ok) {
        const transformed = OracleRerankResponseTransform(
          responseBody,
          response.status,
          response.headers
        );
        console.log(`✅ Live API test: Success`);
        console.log(`   - Model: ${transformed.model}`);
        console.log(`   - Results: ${transformed.results.length} ranked`);
        passed++;
      } else {
        console.log(`❌ Live API test failed: ${response.status}`);
        console.log(`   ${JSON.stringify(responseBody)}`);
        failed++;
      }
    } catch (error: any) {
      console.log(`❌ Live API error: ${error.message}`);
      failed++;
    }
  } else {
    console.log('\n⏭️  Skipping live API tests (requires DEDICATED mode)');
    console.log('   Set ORACLE_SERVING_MODE=DEDICATED and ORACLE_ENDPOINT_ID');
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log(`📊 Results: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(50));

  process.exit(failed > 0 ? 1 : 0);
}

runIntegrationTests().catch(console.error);

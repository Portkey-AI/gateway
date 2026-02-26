import { RERANK_ENDPOINT } from '../resources/constants';
import { getRerankRequest } from '../resources/requestTemplates';
import { TestVariable } from '../resources/testVariables';
import { createDefaultHeaders, createOracleHeaders } from '../resources/utils';

interface RerankResult {
  index: number;
  relevance_score: number;
  document?: {
    text: string;
  };
}

interface RerankResponse {
  id: string;
  object: string;
  model: string;
  results: RerankResult[];
}

export const executeRerankEndpointTests: (
  providerName: string,
  providerVariables: TestVariable
) => void = (providerName, providerVariables) => {
  const model = providerVariables.rerank?.model;
  if (!model) {
    console.warn(
      `Skipping ${providerName} rerank tests as it does not have rerank options`
    );
    return;
  }

  const isOracle = providerName === 'oracle';

  test(`${providerName} /rerank test with string documents`, async () => {
    const headers = isOracle
      ? createOracleHeaders(providerVariables.oracle!)
      : createDefaultHeaders(providerName, providerVariables.apiKey!);

    const res = await fetch(RERANK_ENDPOINT, {
      method: 'POST',
      headers,
      body: getRerankRequest(model, 'string'),
    });
    expect(res.status).toEqual(200);

    const body = (await res.json()) as RerankResponse;
    expect(body.results).toBeDefined();
    expect(Array.isArray(body.results)).toBe(true);
    expect(body.results.length).toBeGreaterThan(0);
    expect(body.results[0]).toHaveProperty('index');
    expect(body.results[0]).toHaveProperty('relevance_score');
  });

  test(`${providerName} /rerank test with object documents`, async () => {
    const headers = isOracle
      ? createOracleHeaders(providerVariables.oracle!)
      : createDefaultHeaders(providerName, providerVariables.apiKey!);

    const res = await fetch(RERANK_ENDPOINT, {
      method: 'POST',
      headers,
      body: getRerankRequest(model, 'object'),
    });
    expect(res.status).toEqual(200);

    const body = (await res.json()) as RerankResponse;
    expect(body.results).toBeDefined();
    expect(Array.isArray(body.results)).toBe(true);
  });

  test(`${providerName} /rerank test with top_n parameter`, async () => {
    const headers = isOracle
      ? createOracleHeaders(providerVariables.oracle!)
      : createDefaultHeaders(providerName, providerVariables.apiKey!);

    const res = await fetch(RERANK_ENDPOINT, {
      method: 'POST',
      headers,
      body: getRerankRequest(model, 'string', { top_n: 2 }),
    });
    expect(res.status).toEqual(200);

    const body = (await res.json()) as RerankResponse;
    expect(body.results).toBeDefined();
    expect(body.results.length).toBeLessThanOrEqual(2);
  });

  test(`${providerName} /rerank test with return_documents`, async () => {
    const headers = isOracle
      ? createOracleHeaders(providerVariables.oracle!)
      : createDefaultHeaders(providerName, providerVariables.apiKey!);

    const res = await fetch(RERANK_ENDPOINT, {
      method: 'POST',
      headers,
      body: getRerankRequest(model, 'string', { return_documents: true }),
    });
    expect(res.status).toEqual(200);

    const body = (await res.json()) as RerankResponse;
    expect(body.results).toBeDefined();
    // When return_documents is true, results should include document objects
    if (body.results.length > 0) {
      expect(body.results[0]).toHaveProperty('document');
      expect(body.results[0].document).toHaveProperty('text');
    }
  });
};

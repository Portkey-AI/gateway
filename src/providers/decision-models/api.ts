import { ProviderAPIConfig } from '../types';

const DEFAULT_DECISION_MODELS_BASE_URL = 'https://api.decisionmodels.io/v1';

// Decision Models serves decision endpoints (POST /v1/decisions in the
// OpenAI Decisions API shape, POST /v1/systemone, GET /v1/models).
// They are reached through the gateway's proxy routes, so no request or
// response transforms are needed. The optional `S1-Region: eu` header is
// forwarded unchanged and keeps processing inside the EU.
const DecisionModelsAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => DEFAULT_DECISION_MODELS_BASE_URL,
  headers: ({ providerOptions }) => {
    return {
      Authorization: `Bearer ${providerOptions.apiKey}`,
    };
  },
  getEndpoint: ({ fn }) => {
    switch (fn) {
      default:
        return '';
    }
  },
};

export default DecisionModelsAPIConfig;

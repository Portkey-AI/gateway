import { ProviderAPIConfig } from '../types';

const DatabricksAPIConfig: ProviderAPIConfig = {
  getBaseURL: ({ providerOptions }) => {
    // Support custom base URL or construct from workspace
    if (providerOptions.databricksBaseURL) {
      return providerOptions.databricksBaseURL;
    }
    const workspace = providerOptions.databricksWorkspace;
    if (!workspace) {
      throw new Error('Databricks workspace or base URL must be provided');
    }
    return `https://${workspace}.cloud.databricks.com/serving-endpoints`;
  },
  headers: ({ providerOptions }) => {
    const headersObj: Record<string, string> = {
      Authorization: `Bearer ${providerOptions.apiKey}`,
    };

    return headersObj;
  },
  getEndpoint: ({ fn }) => {
    // Databricks uses /invocations for all endpoints
    // The base URL should include the model name: /serving-endpoints/{model}/invocations
    switch (fn) {
      case 'complete':
      case 'chatComplete':
      case 'embed':
        return '/invocations';
      default:
        return '';
    }
  },
};

export default DatabricksAPIConfig;

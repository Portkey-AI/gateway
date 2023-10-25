import { ProviderAPIConfig } from '../types';

const AzureOpenAIAPIConfig: ProviderAPIConfig = {
    getBaseURL: (RESOURCE_NAME: string, DEPLOYMENT_ID: string) =>
        `https://${RESOURCE_NAME}.openai.azure.com/openai/deployments/${DEPLOYMENT_ID}`,
    headers: (API_KEY: string, TYPE: string) => {
        switch (TYPE) {
            case 'apiKey': {
                return { 'api-key': `${API_KEY}` };
            }
            case 'adAuth': {
                return { Authorization: `Bearer ${API_KEY}` };
            }
        }
    },
    getEndpoint: (fn: string, API_VERSION: string) => {
        switch (fn) {
            case 'complete': {
                return `/completions?api-version=${API_VERSION}`;
            }
            case 'chatComplete': {
                return `/chat/completions?api-version=${API_VERSION}`;
            }
            case 'embed': {
                return `/embeddings?api-version=${API_VERSION}`;
            }
        }
    },
};

export default AzureOpenAIAPIConfig;


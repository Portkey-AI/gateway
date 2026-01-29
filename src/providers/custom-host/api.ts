import { ProviderAPIConfig } from '../types';

const CustomHostApiConfig: ProviderAPIConfig = {
    getBaseURL: ({ providerOptions }) => {
        return providerOptions?.customHost || providerOptions?.custom_host || '';
    },
    headers: ({ providerOptions }) => {
        const headers: Record<string, string> = {};
        if (providerOptions?.apiKey) {
            headers['Authorization'] = `Bearer ${providerOptions.apiKey}`;
        }
        return headers;
    },
    getEndpoint: ({ fn }) => {
        return '';
    },
};

export default CustomHostApiConfig;

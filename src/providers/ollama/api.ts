import { ProviderAPIConfig } from '../types';

const OllamaAPIConfig: ProviderAPIConfig = {
    getBaseURL: (bUrl?: string) => bUrl,
    headers: () => {},
    complete: '/api/generate',
    embed: '/api/embeddings',
};

export default OllamaAPIConfig;


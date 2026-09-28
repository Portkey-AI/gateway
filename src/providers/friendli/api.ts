import { ProviderAPIConfig } from '../types';

const FriendliAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://api.friendli.ai/serverless/v1',
  headers: ({ providerOptions }) => {
    const headersObj: Record<string, string> = {
      Authorization: `Bearer ${providerOptions.apiKey}`,
    };
    if (providerOptions.friendliTeam) {
      headersObj['X-Friendli-Team'] = providerOptions.friendliTeam;
    }
    return headersObj;
  },
  getEndpoint: ({ fn }) => {
    switch (fn) {
      case 'chatComplete':
        return '/chat/completions';
      default:
        return '';
    }
  },
};

export default FriendliAPIConfig;

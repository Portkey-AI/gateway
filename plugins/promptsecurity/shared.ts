import { post } from '../utils';

export const promptSecurityProtectApi = async (credentials: any, data: any) => {
  const headers = {
    'APP-ID': credentials.apiKey,
    'Content-Type': 'application/json',
  };
  const url = `https://${credentials.apiDomain}/api/protect`;
  return post(url, data, { headers });
};

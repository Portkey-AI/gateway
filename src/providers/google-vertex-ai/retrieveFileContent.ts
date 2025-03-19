import { GoogleErrorResponseTransform } from './utils';

export const GoogleRetrieveFileContentResponseTransform = (
  response: Response,
  status: number
) => {
  if (status !== 200) {
    return GoogleErrorResponseTransform(response as any) || response;
  }
  return response;
};

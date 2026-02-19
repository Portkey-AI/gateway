import { POWERED_BY } from '../../globals';

export const AzureImageEditRequestTransform = (
  body: FormData,
  requestHeaders: Record<string, string>
) => {
  const apiVersion = requestHeaders[`x-${POWERED_BY}-azure-api-version`];

  const isAzureV1API = apiVersion?.trim() === 'v1';

  // Remove 'model' for non-v1 API — Azure validates it but deployment names don't pass validation.
  if (body.has('model') && !isAzureV1API) {
    body.delete('model');
  }
  return body;
};

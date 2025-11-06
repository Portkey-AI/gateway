import { RequestHandler } from '../types';
import GoogleApiConfig from './api';
import { getBucketAndFile } from './utils';

export const GoogleRetrieveFileRequestHandler: RequestHandler = async ({
  requestURL,
  providerOptions,
}) => {
  const fileId = requestURL.split('/').pop();

  const { bucket, file } = getBucketAndFile(fileId ?? '');

  const headers = await GoogleApiConfig.headers({ providerOptions } as any);

  const url = `https://storage.googleapis.com/${bucket}/${file}`;

  const response = await fetch(url, { headers, method: 'HEAD' });

  if (response.status !== 200) {
    throw new Error('File not found');
  }

  const responseHeaders = response.headers;

  const bytes = responseHeaders.get('Content-Length');
  const updatedAt = responseHeaders.get('Last-Modified');
  const createdAt = responseHeaders.get('Date');
  const id = fileId;
  const filename = file.split('/').pop();
  const purpose = null;
  const status = 'processed';

  const fileObject = {
    bytes: Number.parseInt(bytes ?? '0'),
    updatedAt: new Date(updatedAt ?? '').getTime(),
    createdAt: new Date(createdAt ?? '').getTime(),
    id,
    filename,
    purpose,
    status,
  };

  return new Response(JSON.stringify(fileObject), {
    headers: { 'Content-Type': 'application/json' },
  });
};

export const GoogleRetrieveFileResponseTransform = (response: Response) => {
  return response;
};

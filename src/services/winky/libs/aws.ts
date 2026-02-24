import { SignatureV4 } from '@smithy/signature-v4';
import { Sha256 } from '@aws-crypto/sha256-js';

export async function generateAWSHeaders(
  body: string | undefined,
  headers: Record<string, any>,
  url: string,
  method: string,
  awsService: string,
  awsRegion: string,
  awsAccessKeyID: string,
  awsSecretAccessKey: string,
  awsSessionToken?: string
) {
  const signer = new SignatureV4({
    service: awsService,
    region: awsRegion || 'us-east-1',
    credentials: {
      accessKeyId: awsAccessKeyID,
      secretAccessKey: awsSecretAccessKey,
      ...(awsSessionToken && { sessionToken: awsSessionToken }),
    },
    sha256: Sha256,
  });

  const urlObj = new URL(url);
  const protocol = urlObj.protocol?.replace(':', '')?.toLowerCase();
  headers['host'] = urlObj.host;
  const request = {
    method: method,
    path: urlObj.pathname,
    protocol: protocol || 'https',
    hostname: urlObj.hostname,
    headers: headers,
    body,
  };
  const signed = await signer.sign(request);
  return signed.headers;
}

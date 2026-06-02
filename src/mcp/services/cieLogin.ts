import crypto, { X509Certificate } from 'crypto';
import { jwtVerify } from 'jose';
import { createLogger } from '../../shared/utils/logger';
import { Environment } from '../../utils/env';

const logger = createLogger('CIE-Login');

const casSigningKey: crypto.KeyObject | null = (() => {
  const chainPem = Environment({}).CIE_CAS_SIGNING_CERT_CHAIN;
  if (!chainPem) {
    logger.warn(
      'CIE_CAS_SIGNING_CERT_CHAIN not configured — CIE login disabled'
    );
    return null;
  }

  const certs = chainPem
    .match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g)!
    .map((pem: string) => new X509Certificate(pem));

  for (let i = 0; i < certs.length - 1; i++) {
    if (!certs[i].checkIssued(certs[i + 1])) {
      throw new Error(
        `Certificate chain broken at index ${i}: ${certs[i].subject} not issued by ${certs[i + 1].subject}`
      );
    }
  }

  logger.info('CAS signing cert chain loaded', {
    leaf: certs[0].subject,
    chainLength: certs.length,
  });
  return certs[0].publicKey as crypto.KeyObject;
})();

export async function verifyCasJwt(
  token: string
): Promise<Record<string, unknown> | null> {
  try {
    if (!casSigningKey) {
      throw new Error('CIE_CAS_SIGNING_CERT_CHAIN not configured');
    }
    const { payload } = await jwtVerify(token, casSigningKey, {
      algorithms: ['RS256', 'RS384', 'RS512'],
    });
    return payload as Record<string, unknown>;
  } catch (err: any) {
    logger.error('CAS JWT verification failed', { error: err.message });
    return null;
  }
}

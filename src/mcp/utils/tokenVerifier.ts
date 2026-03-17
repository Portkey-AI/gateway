/**
 * MCP Token Verifier
 * HMAC-SHA256 based token verification for presigned MCP URLs
 * Based on the AdapterToken implementation from @stringcost/shared
 */

import { createHmac } from 'crypto';
import { Buffer } from 'buffer';

export interface MCPTokenPayload {
  // Identity & Session
  uid: string; // user_id
  sid: string; // session_id
  cid: string; // client_id
  tid?: string; // tenant_id

  // Authorization
  provider: string;
  paths: string[]; // e.g., ['/v1/chat/completions', '/v1/embeddings'] or ['/v1/*']
  perms?: string[];
  vk?: string; // virtual_key

  // Validation
  iat: number; // issued_at
  exp: number; // expires_at
  nbf?: number; // not_before

  // Security
  nonce: string;
  ip?: string; // ip_restriction
  max_req?: number;
  max_uses?: number; // -1 for unlimited, >0 for limited uses

  // Additional context
  meta?: Record<string, any>;

  // Token version
  v: number;
}

export interface TokenVerificationResult {
  isValid: boolean;
  payload: MCPTokenPayload | null;
  error: string | null;
}

export class MCPTokenVerifier {
  constructor(private secretKey: string) {}

  verifyToken(
    token: string,
    requestPath: string,
    requestIp?: string,
    skipPathValidation: boolean = false
  ): TokenVerificationResult {
    try {
      const tokenData = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
      const { p: payloadEncoded, s: providedSignature } = tokenData;

      const canonical = Buffer.from(payloadEncoded, 'base64url').toString('utf8');
      const payload: MCPTokenPayload = JSON.parse(canonical);

      // 1. Verify signature
      const expectedSignature = createHmac('sha256', this.secretKey).update(canonical).digest('hex');
      if (providedSignature !== expectedSignature) {
        return { isValid: false, payload, error: 'Invalid signature' };
      }

      // 2. Check path authorization (unless explicitly skipped to let downstream validate)
      if (!skipPathValidation) {
        const authorizedPaths = payload.paths || [];
        let isPathAuthorized = false;
        for (const pattern of authorizedPaths) {
          if (pattern.endsWith('*')) {
            const prefix = pattern.slice(0, -1);
            if (requestPath.startsWith(prefix)) {
              isPathAuthorized = true;
              break;
            }
          } else if (pattern === requestPath) {
            isPathAuthorized = true;
            break;
          }
        }

        if (!isPathAuthorized) {
          return { isValid: false, payload, error: 'Path not authorized' };
        }
      }

      // 3. Check expiry
      const now = Math.floor(Date.now() / 1000);
      if (now > payload.exp) {
        return { isValid: false, payload, error: 'Token expired' };
      }

      // 4. Check not-before
      if (payload.nbf && now < payload.nbf) {
        return { isValid: false, payload, error: 'Token not yet valid' };
      }

      // 5. Check IP restriction
      if (payload.ip && requestIp !== payload.ip) {
        return { isValid: false, payload, error: `IP mismatch. Expected ${payload.ip}, got ${requestIp}` };
      }

      return { isValid: true, payload, error: null };

    } catch (e) {
      return { isValid: false, payload: null, error: `Token parsing error: ${(e as Error).message}` };
    }
  }
}

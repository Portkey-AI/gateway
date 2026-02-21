/**
 * Webhook Signature Verifier Plugin Middleware
 *
 * Demonstrates how external middleware can register custom routes to a Hono app.
 * This example validates HMAC-SHA256 signatures on webhook requests.
 *
 * Usage:
 *   npm run start:node -- --middlewares-dir=./external-examples/middlewares --port=8787
 *
 * Then test with:
 *   curl -X POST http://localhost:8787/webhooks/verify \
 *     -H "Content-Type: application/json" \
 *     -H "X-Signature: <HMAC-SHA256 signature>" \
 *     -d '{"event":"order.created","data":{"orderId":"123"}}'
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'demo-secret-key';

/**
 * Compute HMAC-SHA256 signature of the request body
 */
function computeSignature(body, secret) {
  const hmac = createHmac('sha256', secret);
  hmac.update(body);
  return hmac.digest('hex');
}

/**
 * Plugin-style middleware factory
 * Returns a function that receives the Hono app instance
 */
export const middleware = () => {
  return (app) => {
    console.log('[WebhookVerifier] Registering route: POST /webhooks/verify');

    /**
     * Webhook signature verification endpoint
     *
     * This demonstrates that external middleware can:
     * 1. Register custom routes to the app
     * 2. Handle request/response like any standard Hono handler
     * 3. Access app context and utilities
     *
     * Request headers:
     *   - X-Signature: HMAC-SHA256 signature of the body
     *   - X-Timestamp: (optional) Timestamp for replay protection
     *
     * Response:
     *   - 200: Signature valid, webhook processed
     *   - 401: Missing signature header
     *   - 403: Invalid signature
     *   - 400: Invalid request format
     */
    app.post('/webhooks/verify', async (c) => {
      try {
        // 1. Extract signature from headers
        const providedSignature = c.req.header('x-signature');

        if (!providedSignature) {
          return c.json(
            {
              error: 'Missing signature',
              message: 'X-Signature header is required',
            },
            401
          );
        }

        // 2. Read request body
        const body = await c.req.text();

        if (!body) {
          return c.json(
            {
              error: 'Empty body',
              message: 'Request body cannot be empty',
            },
            400
          );
        }

        // 3. Compute expected signature
        const expectedSignature = computeSignature(body, WEBHOOK_SECRET);

        // 4. Verify signature (constant-time comparison to prevent timing attacks)
        let isValid = false;
        try {
          isValid = timingSafeEqual(
            Buffer.from(expectedSignature),
            Buffer.from(providedSignature)
          );
        } catch {
          // Length mismatch throws - this is also constant-time via exception
          isValid = false;
        }

        if (!isValid) {
          console.log('[WebhookVerifier] Invalid signature detected', {
            received: providedSignature.substring(0, 8) + '...',
            expected: expectedSignature.substring(0, 8) + '...',
          });

          return c.json(
            {
              error: 'Invalid signature',
              message: 'Webhook signature verification failed',
            },
            403
          );
        }

        // 5. Optional: Parse and validate JSON structure
        let payload;
        try {
          payload = JSON.parse(body);
        } catch (e) {
          return c.json(
            {
              error: 'Invalid JSON',
              message: 'Request body must be valid JSON',
            },
            400
          );
        }

        // 6. Success: Log and respond
        console.log('[WebhookVerifier] Webhook verified', {
          event: payload.event,
          timestamp: new Date().toISOString(),
          dataKeys: Object.keys(payload.data || {}),
        });

        return c.json(
          {
            status: 'verified',
            message: 'Webhook signature is valid and has been processed',
            event: payload.event,
            processedAt: new Date().toISOString(),
          },
          200
        );
      } catch (error) {
        console.error(
          '[WebhookVerifier] Error processing webhook:',
          error.message
        );

        return c.json(
          {
            error: 'Processing error',
            message:
              error.message || 'An error occurred while processing the webhook',
          },
          500
        );
      }
    });

    // Additional health check endpoint for this webhook verifier
    app.get('/webhooks/health', (c) => {
      return c.json({
        status: 'healthy',
        service: 'WebhookSignatureVerifier',
        endpoint: 'POST /webhooks/verify',
        signingAlgorithm: 'HMAC-SHA256',
      });
    });
  };
};

/**
 * Metadata describing this middleware
 * Used by Portkey's middleware loader for logging and identification
 */
export const metadata = {
  name: 'webhookSignatureVerifier',
  description:
    'Registers webhook signature verification endpoints (HMAC-SHA256)',
  version: '1.0.0',
  author: 'Portkey Team',
  pattern: '/webhooks/*',
  appExtension: true,
};

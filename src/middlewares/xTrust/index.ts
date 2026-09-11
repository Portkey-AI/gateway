import { Context, Next } from 'hono'

interface XTrustPayload {
  sub: string
  score: number
  iat: number
  exp: number
}

function b64urlToBytes(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

async function verifyXTrust(
  token: string,
  secret: string
): Promise<XTrustPayload | null> {
  const parts = token.split('.')
  if (parts.length !== 3 || parts[0] !== 'v1') return null
  const [, payloadB64, sigB64] = parts
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    )
    const ok = await crypto.subtle.verify(
      'HMAC',
      key,
      b64urlToBytes(sigB64),
      new TextEncoder().encode(payloadB64)
    )
    if (!ok) return null
    const payload = JSON.parse(
      new TextDecoder().decode(b64urlToBytes(payloadB64))
    ) as XTrustPayload
    const now = Math.floor(Date.now() / 1000)
    if (now > payload.exp || now - payload.iat > 120) return null
    if (payload.score < 0 || payload.score > 1) return null
    return payload
  } catch {
    return null
  }
}

export async function xTrustMiddleware(
  c: Context,
  next: Next,
  secret: string,
  minScore = 0
): Promise<void> {
  const token = c.req.header('x-trust') ?? ''
  const payload = token ? await verifyXTrust(token, secret) : null
  const score = payload?.score ?? 0
  const trusted = payload !== null && score >= minScore
  // Doctrine AIR: annotate, never block
  c.set('xTrust', { trusted, score, annotated: true })
  await next()
                         }

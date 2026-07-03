/**
 * @file src/shared/services/cache/utils/valkeyRateLimiter.ts
 * Token-bucket rate limiter for the Valkey GLIDE client.
 *
 * Uses the same Lua script logic as the ioredis RedisRateLimiter but adapted
 * for GLIDE's Script/invokeScript API. GLIDE manages script caching internally,
 * so there is no need to LOAD the script manually or handle NOSCRIPT errors.
 */
import { GlideClient, GlideClusterClient, Script } from '@valkey/valkey-glide';
import { RateLimiterKeyTypes } from '../../../../globals';

const RATE_LIMIT_LUA = `
local tokensKey = KEYS[1]
local refillKey = KEYS[2]

local capacity = tonumber(ARGV[1])
local windowSize = tonumber(ARGV[2])
local units = tonumber(ARGV[3])
local now = tonumber(ARGV[4])
local ttl = tonumber(ARGV[5])
local consume = tonumber(ARGV[6]) -- 1 = consume, 0 = check only

-- Reject invalid input
if units <= 0 or capacity <= 0 or windowSize <= 0 then
  return {0, -1, -1}
end

local lastRefill = tonumber(redis.call("GET", refillKey) or "0")
local tokens = tonumber(redis.call("GET", tokensKey) or "-1")

local tokensModified = false
local refillModified = false

-- Initialization
if tokens == -1 then
  tokens = capacity
  tokensModified = true
end

if lastRefill == 0 then
  lastRefill = now
  refillModified = true
end

-- Refill logic
local elapsed = now - lastRefill
if elapsed > 0 then
  local rate = capacity / windowSize
  local tokensToAdd = math.floor(elapsed * rate)
  if tokensToAdd > 0 then
    tokens = math.min(tokens + tokensToAdd, capacity)
    lastRefill = now
    tokensModified = true
    refillModified = true
  end
end

-- Consume logic
local allowed = 0
local waitTime = 0
local currentTokens = tokens

if tokens >= units then
  allowed = 1
  if consume == 1 then
    tokens = tokens - units
    tokensModified = true
  end
else
  if tokens > 0 then
    tokensModified = true
  end
  tokens = 0
  local needed = units - currentTokens
  local rate = capacity / windowSize
  waitTime = (rate > 0) and math.floor(needed / rate) or -1
end

-- Save changes
if tokensModified then
  redis.call("SET", tokensKey, tokens, "PX", ttl)
end

if refillModified then
  redis.call("SET", refillKey, lastRefill, "PX", ttl)
end

return {allowed, waitTime, currentTokens}
`;

class ValkeyRateLimiter {
  private script: Script;
  private tokensKey: string;
  private lastRefillKey: string;
  private keyTTL: number;
  private keyType: RateLimiterKeyTypes;
  private key: string;

  constructor(
    private client: GlideClient | GlideClusterClient,
    key: string,
    private capacity: number,
    private windowSize: number,
    keyType: RateLimiterKeyTypes,
    ttlFactor: number = 3
  ) {
    this.key = key;
    this.keyType = keyType;
    this.keyTTL = windowSize * ttlFactor;

    // GLIDE manages script caching internally via Script object
    this.script = new Script(RATE_LIMIT_LUA);

    const tag = `{rate:${key}}`;
    this.tokensKey = `default:default:${tag}:tokens`;
    this.lastRefillKey = `default:default:${tag}:lastRefill`;
  }

  async checkRateLimit(
    units: number,
    consume: boolean = true
  ): Promise<{
    keyType: RateLimiterKeyTypes;
    key: string;
    allowed: boolean;
    waitTime: number;
    currentTokens: number;
  }> {
    const now = Date.now();

    const result = await this.client.invokeScript(this.script, {
      keys: [this.tokensKey, this.lastRefillKey],
      args: [
        this.capacity.toString(),
        this.windowSize.toString(),
        units.toString(),
        now.toString(),
        this.keyTTL.toString(),
        consume ? '1' : '0',
      ],
    });

    const [allowed, waitTime, currentTokens] = result as number[];

    return {
      keyType: this.keyType,
      key: this.key,
      allowed: allowed === 1,
      waitTime: Number(waitTime),
      currentTokens: Number(currentTokens),
    };
  }

  async decrementToken(
    units: number
  ): Promise<{ allowed: boolean; waitTime: number }> {
    const { allowed, waitTime } = await this.checkRateLimit(units, true);
    return { allowed, waitTime };
  }
}

export default ValkeyRateLimiter;

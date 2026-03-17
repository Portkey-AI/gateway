import { Redis, Cluster } from 'ioredis';
import { RateLimiterKeyTypes } from '../../../../globals';
import { RedisCacheBackend } from '../backends/redis';

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
    lastRefill = now -- simpler and avoids drift
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

class RedisRateLimiter {
  private redis: RedisCacheBackend;
  private capacity: number;
  private windowSize: number;
  private tokensKey: string;
  private lastRefillKey: string;
  private keyTTL: number;
  private scriptSha: string | null = null; // To store the SHA1 hash of the script
  private keyType: RateLimiterKeyTypes;
  private key: string;

  constructor(
    redisClient: RedisCacheBackend,
    capacity: number,
    windowSize: number,
    key: string,
    keyType: RateLimiterKeyTypes,
    ttlFactor: number = 3 // multiplier for TTL
  ) {
    this.redis = redisClient;
    const tag = `{rate:${key}}`; // ensures same hash slot
    this.capacity = capacity;
    this.windowSize = windowSize;
    this.tokensKey = `default:default:${tag}:tokens`;
    this.lastRefillKey = `default:default:${tag}:lastRefill`;
    this.keyTTL = windowSize * ttlFactor; // dynamic TTL
    this.keyType = keyType;
    this.key = key;
  }

  // Helper to load script if not already loaded and return SHA
  private async loadOrGetScriptSha(): Promise<string> {
    if (this.scriptSha) {
      return this.scriptSha;
    }
    // Load the script into Redis and get its SHA1 hash
    const shaString: any = await this.redis.script('LOAD', RATE_LIMIT_LUA);
    this.scriptSha = shaString;
    return shaString;
  }

  private async executeScript(keys: string[], args: string[]): Promise<any> {
    // Get SHA (loads script if not already loaded on current client)
    const sha = await this.loadOrGetScriptSha();

    try {
      return await this.redis.evalsha(sha, keys, args);
    } catch (error: any) {
      if (error.message.includes('NOSCRIPT')) {
        // Script not loaded on target node - load it and retry with same SHA
        await this.redis.script('LOAD', RATE_LIMIT_LUA);
        return await this.redis.evalsha(sha, keys, args);
      }
      throw error;
    }
  }

  async checkRateLimit(
    units: number,
    consumeTokens: boolean = true // Default to true to consume tokens
  ): Promise<{
    keyType: RateLimiterKeyTypes;
    key: string;
    allowed: boolean;
    waitTime: number;
    currentTokens: number;
  }> {
    const now = Date.now();
    // Get the SHA, loading the script into Redis if this is the first time
    const resp: any = await this.executeScript(
      [this.tokensKey, this.lastRefillKey],
      [
        this.capacity.toString(),
        this.windowSize.toString(),
        units.toString(),
        now.toString(),
        this.keyTTL.toString(),
        consumeTokens ? '1' : '0', // Pass consume flag to Lua script
      ]
    );
    const [allowed, waitTime, currentTokens] = resp;
    return {
      keyType: this.keyType,
      key: this.key,
      allowed: allowed === 1,
      waitTime: Number(waitTime),
      currentTokens: Number(currentTokens), // Return current tokens
    };
  }

  async getToken(): Promise<string | null> {
    const cacheEntry = await this.redis.get(this.tokensKey);
    return cacheEntry ? cacheEntry.value : null;
  }

  async decrementToken(
    units: number
  ): Promise<{ allowed: boolean; waitTime: number }> {
    // Call checkRateLimit ensuring tokens are consumed
    const { allowed, waitTime } = await this.checkRateLimit(units, true);
    return { allowed, waitTime };
  }
}

export default RedisRateLimiter;

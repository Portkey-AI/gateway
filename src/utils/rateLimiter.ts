import { Redis, Cluster } from 'ioredis';
import { RateLimiterKeyTypes } from '../middlewares/portkey/globals';

const RATE_LIMIT_LUA = `
local consumedKey = KEYS[1]
local windowStartKey = KEYS[2]

local capacity = tonumber(ARGV[1])
local windowSize = tonumber(ARGV[2])
local units = tonumber(ARGV[3])
local now = tonumber(ARGV[4])
local ttl = tonumber(ARGV[5])
local consume = tonumber(ARGV[6]) -- 1 = consume, 0 = check only

-- Reject invalid input
if units <= 0 or capacity <= 0 or windowSize <= 0 then
  return {0, -1, -1, 0, 0}
end

local consumed = tonumber(redis.call("GET", consumedKey) or "0")
local windowStart = tonumber(redis.call("GET", windowStartKey) or "0")

-- Compute current fixed window start (aligned to windowSize)
local currentWindowStart = math.floor(now / windowSize) * windowSize
local currentWindowEnd = currentWindowStart + windowSize

-- If stored windowStart is different from current, reset consumed for new window
if windowStart ~= currentWindowStart then
  consumed = 0
  windowStart = currentWindowStart
end

-- Check if request is allowed
local allowed = 0
local waitTime = 0
local availableTokens = capacity - consumed

if consumed + units <= capacity then
  allowed = 1
else
  -- Not allowed; compute ms until current window ends
  waitTime = math.max(0, currentWindowEnd - now)
end

-- Consume tokens
if consume == 1 then
  consumed = consumed + units
  availableTokens = capacity - consumed
end

-- Persist state with TTL
redis.call("SET", consumedKey, consumed, "PX", ttl)
redis.call("SET", windowStartKey, windowStart, "PX", ttl)

return {allowed, waitTime, availableTokens, currentWindowStart, currentWindowEnd}
`;

// Module-level cache for script SHA - shared across all instances
let cachedScriptSha: string | null = null;

class RedisRateLimiter {
  private redis: Redis | Cluster;
  private capacity: number;
  private windowSize: number;
  private consumedKey: string;
  private windowStartKey: string;
  private keyTTL: number;
  private keyType: RateLimiterKeyTypes;
  private key: string;

  constructor(
    redisClient: Redis | Cluster,
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
    this.consumedKey = `${tag}:consumed`;
    this.windowStartKey = `${tag}:windowStart`;
    this.keyTTL = windowSize * ttlFactor; // dynamic TTL
    this.keyType = keyType;
    this.key = key;
  }

  // Helper to load script if not already loaded and return SHA
  private async loadOrGetScriptSha(): Promise<string> {
    if (cachedScriptSha) {
      return cachedScriptSha;
    }
    // Load the script into Redis and get its SHA1 hash
    const shaString: any = await this.redis.script('LOAD', RATE_LIMIT_LUA);
    cachedScriptSha = shaString;
    return shaString;
  }

  private async executeScript(keys: string[], args: string[]): Promise<any> {
    // Get SHA (loads script if not already loaded on current client)
    const sha = await this.loadOrGetScriptSha();

    try {
      return await this.redis.evalsha(sha, keys.length, ...keys, ...args);
    } catch (error: any) {
      if (error.message.includes('NOSCRIPT')) {
        // Script not loaded on target node - use eval directly for cluster safety
        // eval includes the script and will execute on the correct node
        return await this.redis.eval(
          RATE_LIMIT_LUA,
          keys.length,
          ...keys,
          ...args
        );
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
    availableTokens: number;
    windowStart: number;
    windowEnd: number;
  }> {
    const now = Date.now();
    // Get the SHA, loading the script into Redis if this is the first time
    const resp: any = await this.executeScript(
      [this.consumedKey, this.windowStartKey],
      [
        this.capacity.toString(),
        this.windowSize.toString(),
        units.toString(),
        now.toString(),
        this.keyTTL.toString(),
        consumeTokens ? '1' : '0', // Pass consume flag to Lua script
      ]
    );
    const [allowed, waitTime, availableTokens, windowStart, windowEnd] = resp;
    return {
      keyType: this.keyType,
      key: this.key,
      allowed: allowed === 1,
      waitTime: Number(waitTime),
      availableTokens: Number(availableTokens),
      windowStart: Number(windowStart),
      windowEnd: Number(windowEnd),
    };
  }

  async getConsumedTokens(): Promise<string | null> {
    return this.redis.get(this.consumedKey);
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

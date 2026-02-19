interface DurableObjectState {
  storage: DurableObjectStorage;
}

interface DurableObjectStorage {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<boolean>;
}

interface RateLimitRequest {
  capacity: number;
  windowSize: number;
  units?: number;
  consume?: boolean;
  decrementTokens?: boolean;
  key?: string;
  keyType?: string;
  fetchTokens?: boolean;
  rateLimiterType?: string;
  rateLimitUnit?: string;
}

interface RateLimitResponse {
  allowed: boolean;
  waitTime: number;
  availableTokens: number;
  consumed: number;
  currentTokens: number;
  windowStart: number;
  windowEnd: number;
  keyType?: string;
  key?: string;
  rateLimiterType?: string;
  rateLimitUnit?: string;
}

export class RateLimiterDO {
  private state: DurableObjectState;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'POST') {
      return this.handleCheck(request);
    }

    if (path === '/reset' && request.method === 'DELETE') {
      return this.handleReset();
    }

    if (path === '/status') {
      return this.handleStatus();
    }

    return new Response('Not Found', { status: 404 });
  }

  private async handleCheck(request: Request): Promise<Response> {
    const body = await request.json<RateLimitRequest>();
    const {
      capacity,
      windowSize,
      units = 1,
      consume,
      decrementTokens = true,
      key,
      keyType,
      fetchTokens = false,
      rateLimiterType,
      rateLimitUnit,
    } = body;

    const shouldConsume = consume !== undefined ? consume : decrementTokens;

    const now = Date.now();

    // Always read fresh from storage on each request
    const [rawConsumed, rawWindowStart] = await Promise.all([
      this.state.storage.get<number>('consumed'),
      this.state.storage.get<number>('windowStart'),
    ]);

    let consumed = rawConsumed ?? 0;
    let windowStart = rawWindowStart ?? 0;

    if (fetchTokens) {
      return Response.json({
        keyType,
        key,
        consumed,
      });
    }

    if (units <= 0 || capacity <= 0 || windowSize <= 0) {
      return Response.json({
        allowed: false,
        waitTime: -1,
        availableTokens: -1,
        consumed: -1,
        currentTokens: -1,
        windowStart: 0,
        windowEnd: 0,
        keyType,
        key,
        rateLimiterType,
        rateLimitUnit,
      });
    }

    // Compute current fixed window start
    const currentWindowStart = Math.floor(now / windowSize) * windowSize;
    const currentWindowEnd = currentWindowStart + windowSize;

    // If storage windowStart is different, reset consumed for new window
    if (windowStart !== currentWindowStart) {
      consumed = 0;
      windowStart = currentWindowStart;
    }

    // Check if request is allowed
    const allowed = consumed + units <= capacity;
    let waitTime = 0;

    if (!allowed) {
      // Not allowed; compute ms until current window ends
      waitTime = Math.max(0, currentWindowEnd - now);
    }

    // Consume tokens when requested
    if (shouldConsume) {
      consumed += units;
    }

    // Always persist state to storage
    await Promise.all([
      this.state.storage.put('consumed', consumed),
      this.state.storage.put('windowStart', windowStart),
    ]);

    const availableTokens = Math.max(0, capacity - consumed);

    const response: RateLimitResponse = {
      allowed,
      waitTime: Number(waitTime),
      availableTokens,
      consumed: Number(consumed),
      currentTokens: availableTokens, // same as availableTokens
      windowStart: currentWindowStart,
      windowEnd: currentWindowEnd,
      keyType,
      key,
      rateLimiterType,
      rateLimitUnit,
    };

    return Response.json(response);
  }

  private async handleReset(): Promise<Response> {
    await Promise.all([
      this.state.storage.delete('consumed'),
      this.state.storage.delete('windowStart'),
    ]);
    return new Response(null, { status: 204 });
  }

  private async handleStatus(): Promise<Response> {
    const [consumed, windowStart] = await Promise.all([
      this.state.storage.get<number>('consumed'),
      this.state.storage.get<number>('windowStart'),
    ]);
    return Response.json({
      consumed: consumed ?? 0,
      windowStart: windowStart ?? 0,
    });
  }
}

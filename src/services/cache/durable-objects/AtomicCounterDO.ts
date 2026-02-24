interface DurableObjectState {
  storage: DurableObjectStorage;
}

interface DurableObjectStorage {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<boolean>;
}

enum AtomicOperations {
  GET = 'GET',
  RESET = 'RESET',
  INCREMENT = 'INCREMENT',
  DECREMENT = 'DECREMENT',
}

interface AtomicRequest {
  // Operation-based routing (alternative to URL-based)
  operation?: AtomicOperations | string;
  // Common fields
  amount?: number;
  value?: number;
  // Key components - used to construct storage key: ${organisationId}-${type}-${key}
  type?: string;
  organisationId?: string;
  key?: string;
  counterType?: string;
  // Threshold fields for increment
  creditLimit?: number | null;
  alertThreshold?: number | null;
  isThresholdAlertsSent?: boolean | null;
}

interface AtomicResponse {
  success: boolean;
  value: number;
  message?: string;
  // Threshold response fields (only for increment with thresholds)
  thresholdCrossed?: boolean;
  exhausted?: boolean;
  alertThresholdCrossed?: boolean;
}

// Storage key constructed from request fields
function buildStorageKey(
  organisationId?: string,
  type?: string,
  key?: string
): string {
  if (organisationId && type && key) {
    return `${organisationId}-${type}-${key}`;
  }
  return 'value';
}

export class AtomicCounterDO {
  private state: DurableObjectState;
  private env?: unknown;

  constructor(state: DurableObjectState, env?: unknown) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const body = await this.parseBody(request);
    const storageKey = buildStorageKey(
      body.organisationId,
      body.type,
      body.key
    );

    // Determine operation from URL path or body.operation
    const operation = this.resolveOperation(
      url.pathname,
      request.method,
      body.operation
    );

    switch (operation) {
      case AtomicOperations.GET:
        return this.handleGet(storageKey);

      case AtomicOperations.INCREMENT:
        return this.handleIncrement(storageKey, body);

      case AtomicOperations.DECREMENT:
        return this.handleDecrement(storageKey, body.amount ?? 0);

      case AtomicOperations.RESET:
        return this.handleReset(storageKey);

      case 'SET':
        return this.handleSet(storageKey, body.amount ?? 0);

      default:
        return this.errorResponse('Invalid Operation', 400);
    }
  }

  private async parseBody(request: Request): Promise<AtomicRequest> {
    try {
      return await request.json<AtomicRequest>();
    } catch {
      return {};
    }
  }

  private resolveOperation(
    pathname: string,
    method: string,
    bodyOperation?: AtomicOperations | string
  ): string {
    // URL-based routing takes precedence
    if (pathname === '/get') return AtomicOperations.GET;
    if (pathname === '/increment' && method === 'POST')
      return AtomicOperations.INCREMENT;
    if (pathname === '/decrement' && method === 'POST')
      return AtomicOperations.DECREMENT;
    if (pathname === '/set' && method === 'POST') return 'SET';
    if (pathname === '/reset') return AtomicOperations.RESET; // Support both DELETE and POST

    // Fall back to operation field in body
    return bodyOperation?.toUpperCase() ?? '';
  }

  // Core storage operations

  private async get(storageKey: string): Promise<number> {
    const value = await this.state.storage.get<number>(storageKey);
    return value ?? 0;
  }

  private async set(storageKey: string, value: number): Promise<void> {
    await this.state.storage.put(storageKey, value);
  }

  // Handlers

  private async handleGet(storageKey: string): Promise<Response> {
    const value = await this.get(storageKey);
    return this.successResponse(value);
  }

  private async handleIncrement(
    storageKey: string,
    body: AtomicRequest
  ): Promise<Response> {
    const amount = body.amount ?? 0;
    const previousValue = await this.get(storageKey);
    const newValue = previousValue + amount;
    await this.set(storageKey, newValue);

    const response: AtomicResponse = {
      success: true,
      value: newValue,
      thresholdCrossed: false,
      exhausted: false,
      alertThresholdCrossed: false,
    };

    // Check credit limit threshold
    if (
      body.creditLimit != null &&
      body.creditLimit > 0 &&
      newValue >= body.creditLimit
    ) {
      response.exhausted = true;
      response.thresholdCrossed = true;
    }

    // Check alert threshold
    if (
      body.alertThreshold != null &&
      body.alertThreshold > 0 &&
      !body.isThresholdAlertsSent &&
      newValue >= body.alertThreshold
    ) {
      response.alertThresholdCrossed = true;
      response.thresholdCrossed = true;
    }

    return Response.json(response);
  }

  private async handleDecrement(
    storageKey: string,
    amount: number
  ): Promise<Response> {
    const previousValue = await this.get(storageKey);
    const newValue = previousValue - amount;
    await this.set(storageKey, newValue);
    return this.successResponse(newValue);
  }

  private async handleSet(
    storageKey: string,
    value: number
  ): Promise<Response> {
    await this.set(storageKey, value);
    return this.successResponse(value);
  }

  private async handleReset(storageKey: string): Promise<Response> {
    await this.state.storage.delete(storageKey);
    return this.successResponse(0);
  }

  // Response helpers

  private successResponse(value: number): Response {
    return Response.json({ success: true, value });
  }

  private errorResponse(message: string, status: number): Response {
    return Response.json({ success: false, message }, { status });
  }
}

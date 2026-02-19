interface DurableObjectState {
  storage: DurableObjectStorage;
}

interface DurableObjectStorage {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<boolean>;
  deleteAll(): Promise<void>;
  setAlarm(scheduledTime: number | Date): Promise<void>;
  deleteAlarm(): Promise<void>;
}

interface PathData {
  failure_count: number;
  success_count: number;
  first_failure_time?: number;
}

type CircuitBreakerData = Record<string, PathData>;

interface FailureRequest {
  path: string;
  timestamp: number;
}

interface SuccessRequest {
  path: string;
}

export class CircuitBreakerDO {
  private state: DurableObjectState;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      const action = url.pathname.substring(1); // Remove leading slash

      switch (action) {
        case 'recordFailure':
          return await this.handleRecordFailure(request);
        case 'recordSuccess':
          return await this.handleRecordSuccess(request);
        case 'getStatus':
          return await this.handleGetStatus();
        case 'destroy':
          return await this.handleDestroy();
        case 'update':
          return await this.handleUpdate(request);
        default:
          return new Response('Not Found', { status: 404 });
      }
    } catch (error) {
      console.error('Circuit breaker DO error:', error);
      return new Response('Internal Server Error', { status: 500 });
    }
  }

  private async getCircuitBreakerData(): Promise<CircuitBreakerData> {
    const data = await this.state.storage.get<CircuitBreakerData>(
      'circuit_breaker_data'
    );
    return data ?? {};
  }

  private async setCircuitBreakerData(data: CircuitBreakerData): Promise<void> {
    await this.state.storage.put('circuit_breaker_data', data);

    const currentTTL = await this.state.storage.get<number>('ttl');
    const now = Date.now();

    // Only refresh TTL if it doesn't exist or expires within next 6 hours
    if (!currentTTL || currentTTL - now < 6 * 60 * 60 * 1000) {
      const newTTL = now + 86400000; // 24 hours
      await this.state.storage.put('ttl', newTTL);
      await this.state.storage.setAlarm(newTTL);
    }
  }

  private async handleRecordFailure(request: Request): Promise<Response> {
    const { path, timestamp } = await request.json<FailureRequest>();

    const data = await this.getCircuitBreakerData();

    if (!data[path]) {
      data[path] = { failure_count: 0, success_count: 0 };
    }

    data[path].failure_count = data[path].failure_count + 1;

    // Set first_failure_time and reset success count on first failure
    if (!data[path].first_failure_time) {
      data[path].first_failure_time = timestamp;
      data[path].success_count = 0;
    }

    await this.setCircuitBreakerData(data);

    return new Response(
      JSON.stringify({
        failure_count: data[path].failure_count,
      }),
      {
        headers: {
          'content-type': 'application/json',
        },
        status: 200,
      }
    );
  }

  private async handleRecordSuccess(request: Request): Promise<Response> {
    const { path } = await request.json<SuccessRequest>();

    const data = await this.getCircuitBreakerData();

    if (!data[path]) {
      data[path] = { failure_count: 0, success_count: 0 };
    }

    data[path].success_count = data[path].success_count + 1;
    await this.setCircuitBreakerData(data);

    return new Response(
      JSON.stringify({
        success_count: data[path].success_count,
      }),
      {
        headers: {
          'content-type': 'application/json',
        },
        status: 200,
      }
    );
  }

  private async handleGetStatus(): Promise<Response> {
    const data = await this.getCircuitBreakerData();
    return new Response(JSON.stringify(data), {
      headers: {
        'content-type': 'application/json',
      },
      status: 200,
    });
  }

  private async handleDestroy(): Promise<Response> {
    await this.state.storage.deleteAll();
    return new Response(JSON.stringify({ success: true }), {
      headers: {
        'content-type': 'application/json',
      },
      status: 200,
    });
  }

  private async handleUpdate(request: Request): Promise<Response> {
    const data = await request.json<CircuitBreakerData>();
    await this.setCircuitBreakerData(data);
    return new Response(JSON.stringify({ success: true }), {
      headers: {
        'content-type': 'application/json',
      },
      status: 200,
    });
  }

  // Cleanup expired data - called by Durable Object alarm
  async alarm(): Promise<void> {
    const ttl = await this.state.storage.get<number>('ttl');

    if (!ttl || Date.now() >= ttl) {
      // TTL expired or missing - cleanup everything
      await this.state.storage.deleteAll();
      await this.state.storage.deleteAlarm();
    } else {
      // Schedule next cleanup for actual TTL expiry
      await this.state.storage.setAlarm(ttl);
    }
  }
}

import { ParameterConfig } from '../types';
import { BytezInferenceChatCompleteConfig } from './chatComplete';

class LRUCache<K, V> {
  private size: number;
  private map: Map<K, V>;

  constructor({ size = 100 } = {}) {
    this.size = size;
    this.map = new Map();
  }

  get(key: K): V | undefined {
    if (!this.map.has(key)) return undefined;

    // Move the key to the end to mark it as recently used
    const value = this.map.get(key)!;
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  set(key: K, value: V): void {
    if (this.map.has(key)) {
      // Remove the old value to update position
      this.map.delete(key);
    } else if (this.map.size >= this.size) {
      // Remove least recently used (first item in Map)
      const lruKey: any = this.map.keys().next().value;
      this.map.delete(lruKey);
    }

    // Insert the new key-value as most recently used
    this.map.set(key, value);
  }

  has(key: K): boolean {
    return this.map.has(key);
  }

  delete(key: K): boolean {
    return this.map.delete(key);
  }

  keys(): IterableIterator<K> {
    return this.map.keys();
  }

  values(): IterableIterator<V> {
    return this.map.values();
  }

  get length(): number {
    return this.map.size;
  }
}

function bodyAdapter(requestBody: Record<string, any>) {
  for (const [param, paramConfig] of Object.entries(
    BytezInferenceChatCompleteConfig
  )) {
    const hasParam = Boolean(requestBody[param]);

    // first assign defaults
    if (!hasParam) {
      const { default: defaultValue, required } =
        paramConfig as ParameterConfig;

      // if it's required, throw
      if (required) {
        throw new Error(`Param ${param} is required`);
      }

      // assign the default value
      if (defaultValue !== undefined && requestBody[param] === undefined) {
        requestBody[param] = defaultValue;
      }
    }
  }

  // now we remap everything that has an alias, i.e. "prop" on propConfig
  for (const key of Object.keys(requestBody)) {
    const paramObj = BytezInferenceChatCompleteConfig[key] as
      | ParameterConfig
      | undefined;

    if (paramObj) {
      const { param: alias } = paramObj;

      if (key !== alias) {
        requestBody[alias] = requestBody[key];
        delete requestBody[key];
      }
    }
  }

  // now we adapt to the bytez input signature
  // props to skip
  const skipProps: Record<string, boolean> = {
    model: true,
  };

  // props that cannot be removed from the body
  const reservedProps: Record<string, boolean> = {
    stream: true,
    messages: true,
  };

  const adaptedBody: Record<string, any> = { params: {} };

  for (const [key, value] of Object.entries(requestBody)) {
    // things like "model"
    if (skipProps[key]) {
      continue;
    }

    // things like "messages", "stream"
    if (reservedProps[key]) {
      adaptedBody[key] = value;
      continue;
    }
    // anything else, e.g. max_new_tokens
    adaptedBody.params[key] = value;
  }

  return adaptedBody;
}

export { LRUCache, bodyAdapter };

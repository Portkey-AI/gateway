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

export { LRUCache };

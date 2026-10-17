import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class AppCacheService {
  private readonly logger = new Logger(AppCacheService.name);
  private readonly store = new Map<string, { value: any; expiresAt: number }>();

  /**
   * Retrieve cached value if not expired
   */
  get<T>(key: string): T | null {
    const item = this.store.get(key);
    if (!item) return null;

    if (Date.now() > item.expiresAt) {
      this.store.delete(key);
      return null;
    }

    return item.value as T;
  }

  /**
   * Store value in cache with TTL in seconds
   */
  set<T>(key: string, value: T, ttlSeconds: number = 30): void {
    const expiresAt = Date.now() + ttlSeconds * 1000;
    this.store.set(key, { value, expiresAt });
  }

  /**
   * Delete single key
   */
  del(key: string): void {
    this.store.delete(key);
  }

  /**
   * Delete all keys matching string prefix or regex pattern
   */
  delPattern(pattern: string | RegExp): void {
    const regex = typeof pattern === 'string' ? new RegExp(`^${pattern}`) : pattern;
    for (const key of this.store.keys()) {
      if (regex.test(key)) {
        this.store.delete(key);
      }
    }
  }

  /**
   * Clear all cached items
   */
  clear(): void {
    this.store.clear();
  }

  /**
   * Transparent cache-aside helper: returns cached value or executes fetchFn, stores, and returns.
   */
  async getOrSet<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttlSeconds: number = 30,
  ): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const fresh = await fetchFn();
    this.set(key, fresh, ttlSeconds);
    return fresh;
  }
}

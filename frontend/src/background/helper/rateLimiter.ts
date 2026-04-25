// Global token-bucket rate limiter living in the background service worker.
// One instance is shared across every tab/content-script that calls the
// backend, so per-tab bursts can't collectively exceed the limit.
//
// Default config keeps us safely under Gemini API's 15 RPM free-tier limit:
//   - capacity 14 tokens (initial burst)
//   - refill rate 14 tokens / 60 seconds (sustained throughput)

export type TokenBucketConfig = {
  capacity: number;
  refillPerSecond: number;
};

export class TokenBucket {
  private tokens: number;
  private lastRefillMs: number;
  private waiters: Array<() => void> = [];
  private drainTimer: number | null = null;

  constructor(private readonly config: TokenBucketConfig) {
    this.tokens = config.capacity;
    this.lastRefillMs = Date.now();
  }

  async acquire(): Promise<void> {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }
    return new Promise<void>((resolve) => {
      this.waiters.push(resolve);
      this.scheduleDrain();
    });
  }

  private refill(): void {
    const now = Date.now();
    const elapsedSec = (now - this.lastRefillMs) / 1000;
    if (elapsedSec <= 0) return;
    this.tokens = Math.min(
      this.config.capacity,
      this.tokens + elapsedSec * this.config.refillPerSecond,
    );
    this.lastRefillMs = now;
  }

  private scheduleDrain(): void {
    if (this.drainTimer !== null) return;
    const msPerToken = Math.max(50, Math.ceil(1000 / this.config.refillPerSecond));
    this.drainTimer = setTimeout(() => {
      this.drainTimer = null;
      this.drain();
    }, msPerToken) as unknown as number;
  }

  private drain(): void {
    this.refill();
    while (this.tokens >= 1 && this.waiters.length > 0) {
      this.tokens -= 1;
      const resolve = this.waiters.shift()!;
      resolve();
    }
    if (this.waiters.length > 0) {
      this.scheduleDrain();
    }
  }
}

const GEMINI_FREE_TIER_RPM = 14;

export const geminiRateLimiter = new TokenBucket({
  capacity: GEMINI_FREE_TIER_RPM,
  refillPerSecond: GEMINI_FREE_TIER_RPM / 60,
});

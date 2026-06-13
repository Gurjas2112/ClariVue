// Cache-aside helper over Upstash Redis (HTTP, serverless-safe).
// Optional: if UPSTASH_REDIS_REST_URL/_TOKEN are unset, every call transparently
// falls through to the fetcher and invalidation is a no-op. This keeps local dev
// zero-config while the same code path caches in production.
import 'server-only'
import { Redis } from '@upstash/redis'

const enabled = Boolean(
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN,
)

const redis = enabled ? Redis.fromEnv() : null

export async function cached<T>(key: string, ttl: number, fetcher: () => Promise<T>): Promise<T> {
  if (!redis) return fetcher()
  try {
    const hit = await redis.get<T>(key)
    if (hit !== null && hit !== undefined) return hit
  } catch {
    // Cache read failure must never break the request — fall through to source.
  }
  const fresh = await fetcher()
  try {
    if (fresh !== null && fresh !== undefined) await redis.set(key, fresh, { ex: ttl })
  } catch {
    /* ignore write failures */
  }
  return fresh
}

export async function invalidate(...keys: string[]): Promise<void> {
  if (!redis || keys.length === 0) return
  try {
    await redis.del(...keys)
  } catch {
    /* ignore */
  }
}

export const K = {
  invite: (id: string) => `invite:${id}`,
  liveSessions: () => 'live:sessions',
  recording: (sessionId: string) => `rec:${sessionId}`,
  metrics: () => 'metrics:snapshot',
  chat: (sessionId: string) => `chat:${sessionId}`,
}

import type { PoolConfig } from "pg";

/**
 * The pg pool's settings (client.ts). `max` comes from `DB_POOL_MAX` when it
 * is a positive whole number (public API connection budget, plan
 * 2026-11-10-001 U4); otherwise pg's own default (10) stands.
 */
export function poolOptions(
    source: Record<string, string | undefined> = process.env,
): PoolConfig {
    const max = Number(source.DB_POOL_MAX);
    return {
        connectionString: source.DATABASE_URL,
        // Comfortably under the ~5 min after which Neon reaps an idle
        // connection, so we always let go first.
        idleTimeoutMillis: 30_000,
        keepAlive: true,
        ...(Number.isInteger(max) && max > 0 ? { max } : {}),
    };
}

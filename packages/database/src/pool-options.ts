import type { PoolConfig } from "pg";

/** A positive whole number from `source[name]`, else `fallback`; "0" turns it off. */
function ms(
    source: Record<string, string | undefined>,
    name: string,
    fallback: number,
): number | undefined {
    const raw = source[name];
    if (raw === undefined || raw.trim() === "") return fallback;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 0) return fallback;
    return n === 0 ? undefined : n;
}

/**
 * The pg pool's settings (client.ts). `max` comes from `DB_POOL_MAX` when it
 * is a positive whole number (public API connection budget, plan
 * 2026-11-10-001 U4); otherwise pg's own default (10) stands.
 *
 * Every wait is bounded (A-01, 19 Nov M-2): taking a connection from a full
 * pool, one statement, and a transaction left idle. Without them a burst that
 * drained the pool held every other request until the host gave up.
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
        connectionTimeoutMillis: ms(
            source,
            "DB_POOL_CONNECT_TIMEOUT_MS",
            10_000,
        ),
        statement_timeout: ms(source, "DB_STATEMENT_TIMEOUT_MS", 30_000),
        idle_in_transaction_session_timeout: ms(
            source,
            "DB_IDLE_IN_TRANSACTION_TIMEOUT_MS",
            60_000,
        ),
    };
}

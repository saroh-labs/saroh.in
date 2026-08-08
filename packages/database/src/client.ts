import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

import { createRlsProxy } from "./rls-proxy";

const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined;
    pgPool: Pool | undefined;
};

/**
 * We own the pool rather than letting the adapter build one from a config
 * object, for one reason: `pg.Pool` is an EventEmitter that emits `error` when
 * a connection dies while IDLE, and an EventEmitter with no `error` listener
 * THROWS. Against a serverless Postgres that reaps idle connections — Neon
 * does — that is not an edge case, it is a scheduled event, and it took the
 * api down in production-like conditions.
 *
 * `idleTimeoutMillis` is the other half. Recycling our own idle connections on
 * a timer shorter than the provider's reaper means the pool retires them
 * cleanly instead of discovering they were killed underneath it.
 */
function createPool(): Pool {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        // Comfortably under the ~5 min after which Neon reaps an idle
        // connection, so we always let go first.
        idleTimeoutMillis: 30_000,
        keepAlive: true,
    });

    // Idle-client failures are informational: `pg` has already removed the
    // client from the pool and the next query gets a fresh one. Log and carry
    // on — the ONLY thing that must not happen is rethrowing.
    pool.on("error", (error: Error) => {
        console.error(
            `[database] idle pool client error (recovered): ${error.message}`,
        );
    });

    return pool;
}

// Prisma 7 moved the datasource URL out of the schema (it lives in
// prisma.config.js for the CLI) and requires a driver adapter at runtime —
// a bare new PrismaClient() / { datasourceUrl } is rejected. We connect via
// the node-postgres adapter using DATABASE_URL (works with Neon's pooler).
//
// Cached alongside the client so hot-reload reuses one pool instead of leaking
// a new one (and a new `error` listener) on every reload.
const pool = globalForPrisma.pgPool ?? createPool();
if (process.env.NODE_ENV !== "production") globalForPrisma.pgPool = pool;

const adapter = new PrismaPg(pool);

// The cached singleton is the RAW client (unproxied) so hot-reload reuses one
// connection pool.
const baseClient = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = baseClient;

// Everything imports this: the RLS-aware proxy. It is a transparent pass-through
// to `baseClient` unless RLS_ENFORCEMENT is on AND a request org context is
// active (see rls-proxy.ts), so behavior is unchanged by default.
export const prisma = createRlsProxy(baseClient);

export * from "@prisma/client";

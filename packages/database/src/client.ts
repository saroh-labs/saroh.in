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

let ended = false;

/**
 * Close the client AND the pool it runs on.
 *
 * `prisma.$disconnect()` alone is not enough here: the adapter was handed a
 * pool this module created, and Prisma does not end a pool it does not own.
 * The pool's connections then stay open until their 30s idle timeout — which
 * is invisible to a long-running server and fatal to a test run that loads
 * this module fresh in every file: 99 files, up to 10 connections each, and
 * Postgres refuses the rest with "too many clients" (measured: 5 connections
 * open during a burst, still 5 open after `$disconnect()`).
 *
 * For a process that is finishing with the database — a test file's teardown,
 * a script, a server shutting down. Safe to call twice.
 */
export async function disconnectDatabase(): Promise<void> {
    if (ended) return;
    ended = true;
    await baseClient.$disconnect();
    await pool.end();
    // A later import in this process builds a fresh pool rather than reusing
    // the one just ended.
    if (globalForPrisma.pgPool === pool) globalForPrisma.pgPool = undefined;
    if (globalForPrisma.prisma === baseClient)
        globalForPrisma.prisma = undefined;
}

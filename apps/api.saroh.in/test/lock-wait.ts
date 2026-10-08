/**
 * Race tests that interleave two transactions, deterministically.
 *
 * A race test holds one transaction open at a known point, starts the
 * other, and must know the second has reached the lock it is meant to wait
 * on before letting the first go on. A sleep only guesses that: on a slow
 * run the second hasn't got there yet, the race isn't run, and the test
 * passes with the lock removed. Postgres says it outright instead:
 * `pg_locks` lists the lock the second is waiting for, ungranted, and
 * `pg_blocking_pids` names the transaction it waits on (DEV_LEARNINGS,
 * "race tests wait on pg_locks").
 *
 * Integration project only: these read the server's lock table.
 */
import { prisma } from "@saroh/database";

type RawClient = Pick<typeof prisma, "$queryRaw">;

/** The server process behind `tx`'s connection, to name it as the blocker. */
export async function backendPid(tx: RawClient): Promise<number> {
    const [row] = await tx.$queryRaw<{ pid: number }[]>`
        SELECT pg_backend_pid()::int AS pid`;
    return row.pid;
}

/**
 * Resolve once some other connection is waiting on a row of `relation`
 * (a table name, as Prisma spells it: "Site", "Organization") behind a lock
 * that `holder` holds; reject after `timeoutMs` (the test's lock was never
 * reached, which is itself a failure worth seeing, never a pass).
 *
 * The relation matters: a waiter blocked on the wrong row is a different
 * interleaving from the one the test means to pin. A transaction that waits
 * for a row lock holds (or queues for) the row's tuple lock on its table
 * and waits on the holder's transaction id, so the tuple lock names the
 * table either way. (A serializable transaction's SIReadLock predicate
 * locks show as tuple locks too, on every row it read; they block nothing
 * and are left out.)
 */
export async function waitUntilBlockedBy(
    holder: number,
    relation: string,
    timeoutMs = 10_000,
): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        const [row] = await prisma.$queryRaw<{ waiting: number }[]>`
            SELECT count(*)::int AS waiting
            FROM pg_locks l
            JOIN pg_stat_activity a ON a.pid = l.pid
            WHERE NOT l.granted
              AND a.wait_event_type = 'Lock'
              AND ${holder}::int = ANY (pg_blocking_pids(l.pid))
              AND EXISTS (
                  SELECT 1 FROM pg_locks t
                  WHERE t.pid = l.pid
                    AND t.locktype = 'tuple'
                    AND t.mode <> 'SIReadLock'
                    AND t.relation = to_regclass(quote_ident(${relation}))
              )`;
        if (row.waiting > 0) return;
        if (Date.now() > deadline) {
            throw new Error(
                `no connection waited on a "${relation}" row locked by backend ${holder} within ${timeoutMs}ms`,
            );
        }
        // The poll's own pace, not a guess at the race: the answer above
        // decides when to go on. A few milliseconds between asks keeps the
        // poll off the server it is watching.
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
}

/**
 * A promise and the function that settles it: a transaction awaits `wait`
 * to stay open at a known point, and the test calls `release` to let it on.
 */
export function gate<T = void>(): {
    wait: Promise<T>;
    release: (value: T) => void;
} {
    let release: (value: T) => void = () => {};
    const wait = new Promise<T>((resolve) => {
        release = resolve;
    });
    return { wait, release };
}

/**
 * Resolve once some other connection is waiting on an advisory lock that
 * `holder` holds (`pg_advisory_xact_lock`, e.g. a plan meter's,
 * `billing/metering.service.ts`); reject after `timeoutMs`. As
 * {@link waitUntilBlockedBy}, but for a lock that names no table.
 */
export async function waitUntilAdvisoryBlockedBy(
    holder: number,
    timeoutMs = 10_000,
): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        const [row] = await prisma.$queryRaw<{ waiting: number }[]>`
            SELECT count(*)::int AS waiting
            FROM pg_locks l
            WHERE NOT l.granted
              AND l.locktype = 'advisory'
              AND ${holder}::int = ANY (pg_blocking_pids(l.pid))`;
        if (row.waiting > 0) return;
        if (Date.now() > deadline) {
            throw new Error(
                `no connection waited on an advisory lock held by backend ${holder} within ${timeoutMs}ms`,
            );
        }
        // The poll's own pace, as above.
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
}

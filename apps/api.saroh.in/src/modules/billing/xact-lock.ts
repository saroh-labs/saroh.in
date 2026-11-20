import { HttpException, HttpStatus } from "@nestjs/common";
import type { Prisma } from "@saroh/database";

import { env } from "../../env";

/**
 * The bounded transaction lock metered writes take (`metering.service.ts`),
 * on its own so a module the catalogue read loads (the one-Free rule,
 * offers) can take it without loading metering first.
 */

type MeterTx = Prisma.TransactionClient;

/** How long a write waits for the meter lock before it is turned away. */
function meterLockWaitMs(): number {
    const ms = Number(env.PLAN_METER_LOCK_WAIT_MS);
    return Number.isInteger(ms) && ms > 0 ? ms : 3_000;
}

/** 429: too many writes against one limit at once; nothing was written. */
export function meterBusy(): HttpException {
    return new HttpException(
        { message: "Too many changes at once. Wait a moment and try again." },
        HttpStatus.TOO_MANY_REQUESTS,
    );
}

/**
 * Take a transaction advisory lock, waiting at most `PLAN_METER_LOCK_WAIT_MS`
 * and then refusing with {@link meterBusy}, rather than waiting on it
 * unbounded while holding a pool connection (A-01). The wait is Postgres's
 * own `lock_timeout`, set for the lock only, then the caller's own put back.
 */
export async function holdXactLock(
    tx: Pick<MeterTx, "$executeRaw" | "$queryRaw">,
    lock: string,
): Promise<void> {
    // The caller may have set its own earlier in the transaction
    // (billing-customer.ts), which RESET would drop (07 F8).
    const [{ prev } = { prev: "0" }] = await tx.$queryRaw<
        { prev: string }[]
    >`SELECT current_setting('lock_timeout') AS prev`;
    await tx.$executeRaw`SELECT set_config('lock_timeout', ${String(meterLockWaitMs())}, true)`;
    try {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lock}))`;
    } catch (err) {
        const text = `${JSON.stringify((err as { meta?: unknown }).meta ?? null)} ${err instanceof Error ? err.message : ""}`;
        if (text.includes("55P03") || text.includes("lock timeout"))
            throw meterBusy();
        throw err;
    }
    await tx.$executeRaw`SELECT set_config('lock_timeout', ${prev}, true)`;
}

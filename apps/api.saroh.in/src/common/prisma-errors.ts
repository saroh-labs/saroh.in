/**
 * Reading a database error's kind, whichever layer raised it (#106).
 *
 * A serializable transaction that loses a race fails with Postgres 40001.
 * Prisma reports that as `P2034`, but not always: through the pg driver
 * adapter, a conflict raised inside an interactive transaction can surface as
 * a bare `DriverAdapterError` whose `cause.kind` is `TransactionWriteConflict`,
 * with no `code` at all. Every `code === "P2034"` check missed it, so a
 * booking that lost the race for the last seat answered 500 instead of "fully
 * booked". The load smoke found 56 of those in 8,165 concurrent bookings.
 */

interface MaybeDbError {
    code?: unknown;
    name?: unknown;
    cause?: unknown;
}

/** True when Postgres aborted the transaction as a serialization failure. */
export function isSerializationFailure(err: unknown): boolean {
    if (typeof err !== "object" || err === null) return false;
    const e = err as MaybeDbError;
    if (e.code === "P2034") return true;
    if (typeof e.cause === "object" && e.cause !== null) {
        const cause = e.cause as { kind?: unknown; originalCode?: unknown };
        if (cause.kind === "TransactionWriteConflict") return true;
        if (cause.originalCode === "40001") return true;
    }
    return false;
}

/**
 * The Prisma error code, with a driver-adapter serialization failure read as
 * the `P2034` it means. `undefined` for anything that isn't a database error.
 */
export function prismaErrorCode(err: unknown): string | undefined {
    if (isSerializationFailure(err)) return "P2034";
    if (typeof err !== "object" || err === null) return undefined;
    const code = (err as MaybeDbError).code;
    return typeof code === "string" ? code : undefined;
}

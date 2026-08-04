import {
    ConflictException,
    Injectable,
    Logger,
    Optional,
} from "@nestjs/common";
import { prisma } from "@saroh/database";
import { createHash } from "node:crypto";

/**
 * Make a retry safe without making a *different* request invisible.
 *
 * An idempotency key says "this is a retry". It does NOT say "this is the same
 * request", and nothing was checking. The admin flag mutations keyed on actor +
 * operation + target + client key — everything except the value being written —
 * so a second call with the same key and the opposite `enabled` was treated as
 * a duplicate and dropped. The caller got `200` and believed their instruction
 * had been applied. Reproduced live on 2026-07-31.
 *
 * The fix is a fingerprint: a hash of the canonical request stored beside the
 * key. Same key + same fingerprint is a retry, and replays the original
 * response. Same key + DIFFERENT fingerprint is a conflict, and says so —
 * loudly, with `409`, because the alternative is silently discarding somebody's
 * intent.
 *
 * Concurrency resolves deterministically rather than as a `500` (SEC-009): the
 * unique constraint decides the winner, and the loser is told the operation is
 * in flight.
 */
export interface IdempotencyContext {
    /** Operation namespace. Keys are unique per scope + actor, not globally. */
    scope: string;
    /** The client-supplied key. When absent, no idempotency is applied. */
    key: string | undefined;
    actorUserId: string;
    organizationId?: string | null;
}

/** How long a record is honoured before a retry counts as a new request. */
const RETENTION_HOURS = 24;

/**
 * Stable JSON: object keys sorted at every depth so `{a,b}` and `{b,a}` hash
 * alike. Without this the fingerprint would depend on property order, and an
 * identical retry serialized differently would be rejected as a conflict —
 * turning a safety feature into a source of spurious 409s.
 */
function canonicalize(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (value && typeof value === "object") {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>)
                .filter(([, v]) => v !== undefined)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([k, v]) => [k, canonicalize(v)]),
        );
    }
    return value;
}

export function fingerprintOf(request: unknown): string {
    return createHash("sha256")
        .update(JSON.stringify(canonicalize(request)))
        .digest("hex");
}

@Injectable()
export class IdempotencyService {
    private readonly logger = new Logger(IdempotencyService.name);

    constructor(@Optional() private readonly db: typeof prisma = prisma) {}

    /**
     * Run `operation` at most once per (scope, key, actor).
     *
     * Returns the stored response for an identical retry, throws `409` for a
     * key reused with a different payload, and throws `409` for a concurrent
     * duplicate still in flight.
     */
    async run<T>(
        ctx: IdempotencyContext,
        request: unknown,
        operation: () => Promise<T>,
    ): Promise<T> {
        // No key means the caller is not asking for idempotency. Do not invent
        // it: a synthesised key would collide across genuinely distinct calls.
        if (!ctx.key) return operation();

        const fingerprint = fingerprintOf(request);
        const where = {
            scope_key_actorUserId: {
                scope: ctx.scope,
                key: ctx.key,
                actorUserId: ctx.actorUserId,
            },
        };

        try {
            await this.db.idempotencyRecord.create({
                data: {
                    scope: ctx.scope,
                    key: ctx.key,
                    actorUserId: ctx.actorUserId,
                    organizationId: ctx.organizationId ?? null,
                    fingerprint,
                    status: "IN_PROGRESS",
                    expiresAt: new Date(
                        Date.now() + RETENTION_HOURS * 3_600_000,
                    ),
                },
            });
        } catch (error) {
            // The unique constraint is the arbiter — checking first and then
            // creating would leave a window where two requests both pass the
            // check. Let the database decide, then read what it decided.
            if (!isUniqueViolation(error)) throw error;

            const existing = await this.db.idempotencyRecord.findUnique({
                where,
            });
            if (!existing) throw error;

            if (existing.fingerprint !== fingerprint) {
                this.logger.warn(
                    `idempotency conflict: scope=${ctx.scope} key=${ctx.key} — same key, different request`,
                );
                throw new ConflictException(
                    "This idempotency key was already used for a different request. " +
                        "Use a new key, or resend the original request unchanged.",
                );
            }

            if (existing.status === "COMPLETED") {
                return existing.response as T;
            }

            // Same request, still running. Deterministic, never a 500.
            throw new ConflictException(
                "An identical request is already in progress. Retry shortly.",
            );
        }

        try {
            const result = await operation();
            // Widened to `unknown` on purpose. `T` is declared non-nullable, so
            // against `T` the null-check reads as dead code — but an operation
            // returning nothing really does hand back `undefined`, which Prisma
            // cannot store as JSON. The declared type is the optimistic one.
            const stored: unknown = result;
            await this.db.idempotencyRecord.update({
                where,
                data: {
                    status: "COMPLETED",
                    completedAt: new Date(),
                    response: (stored ?? null) as never,
                },
            });
            return result;
        } catch (error) {
            // A failed operation must not leave a record that makes the retry
            // look like a duplicate of something that never happened.
            await this.db.idempotencyRecord
                .delete({ where })
                .catch(() => undefined);
            throw error;
        }
    }
}

/** Prisma's unique-constraint violation. */
function isUniqueViolation(error: unknown): boolean {
    return (
        typeof error === "object" &&
        error !== null &&
        (error as { code?: string }).code === "P2002"
    );
}

import { Injectable, Logger } from "@nestjs/common";
import type { Job, Prisma } from "@saroh/database";

import { env } from "../../env";

/**
 * Tell saroh.in that the published pricing changed (plans catalogue KTD-10):
 * after a publish commits, and again at a scheduled version's go-live.
 *
 * The job row is written in the publish's own transaction (the outbox), so
 * it exists exactly when the version does, and the worker only sees it once
 * that transaction has committed: "after commit" without a post-commit hook.
 * The call is best-effort for the publish (a site that is down never undoes
 * one) and at-least-once for the site: a failed call throws, and the queue
 * retries it with backoff. Revalidating twice is harmless.
 *
 * The hook's contract, which saroh.in's `/api/revalidate` (U24) implements:
 * `POST`, the shared secret in `x-saroh-revalidate-secret` (compared in
 * constant time there), no body that names a path — the site revalidates its
 * own fixed list. The payload's `version` is for the logs only.
 */
export const PRICING_REVALIDATE_TYPE = "pricing.site.revalidate";

/** The header saroh.in reads the shared secret from. */
export const REVALIDATE_SECRET_HEADER = "x-saroh-revalidate-secret";

/** How long one call may take before it counts as failed (and is retried). */
const CALL_TIMEOUT_MS = 10_000;

export interface RevalidatePayload {
    version: number;
    /** Why: a publish (or roll back) that is live now, or a go-live. */
    cause: "publish" | "go-live";
}

/** Where to call and with what, or null when the hook isn't configured. */
export function revalidateHook(): { url: string; secret: string } | null {
    const url = env.PRICING_REVALIDATE_URL;
    const secret = env.PRICING_REVALIDATE_SECRET;
    return url && secret ? { url, secret } : null;
}

/**
 * Queue a revalidation on the caller's transaction. Writes nothing when the
 * hook isn't configured: a job that could only no-op is never queued
 * (backend-jobs.md), and saroh.in then refreshes on its ISR timer.
 */
export async function enqueueSiteRevalidation(
    tx: Pick<Prisma.TransactionClient, "job">,
    payload: RevalidatePayload,
    runAt: Date,
): Promise<boolean> {
    if (!revalidateHook()) return false;
    await tx.job.create({
        data: {
            type: PRICING_REVALIDATE_TYPE,
            payload: { ...payload },
            runAt,
        },
    });
    return true;
}

@Injectable()
export class RevalidateSiteHandler {
    private readonly logger = new Logger(RevalidateSiteHandler.name);

    /** The HTTP call; a spec swaps it for a fake. */
    fetchFn: typeof fetch = (input, init) => fetch(input, init);

    readonly handle = async (job: Job): Promise<void> => {
        const hook = revalidateHook();
        const version = readVersion(job.payload);
        if (!hook) {
            // Configured when queued, unset since: nothing to call.
            this.logger.warn(
                `pricing_revalidate_unconfigured job=${job.id} version=${version ?? "?"}`,
            );
            return;
        }
        let res: Response | null = null;
        let failure = "";
        try {
            res = await this.fetchFn(hook.url, {
                method: "POST",
                headers: {
                    [REVALIDATE_SECRET_HEADER]: hook.secret,
                    "content-type": "application/json",
                },
                body: "{}",
                signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
            });
        } catch (error) {
            failure = error instanceof Error ? error.name : "unknown";
        }
        if (!res) {
            this.logger.warn(
                `pricing_revalidate_unreachable job=${job.id} version=${version ?? "?"} error=${failure}`,
            );
            throw new Error(`saroh.in revalidation unreachable (${failure})`);
        }
        if (!res.ok) {
            this.logger.warn(
                `pricing_revalidate_refused job=${job.id} version=${version ?? "?"} status=${res.status}`,
            );
            throw new Error(`saroh.in revalidation answered ${res.status}`);
        }
        this.logger.log(
            `pricing_revalidated job=${job.id} version=${version ?? "?"}`,
        );
    };
}

function readVersion(payload: unknown): number | null {
    if (payload && typeof payload === "object" && "version" in payload) {
        const v = payload.version;
        return typeof v === "number" ? v : null;
    }
    return null;
}

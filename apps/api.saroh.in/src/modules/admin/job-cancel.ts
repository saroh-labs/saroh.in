import { prisma } from "@saroh/database";

/** A job an operator called off before it ran (#907). Terminal, like DONE. */
export const JOB_CANCELLED = "CANCELLED";

/**
 * Job types an operator may not cancel, and why. Each is a chain or a step
 * whose state lives somewhere else, so a cancelled row would either be
 * started again on its own or leave that state waiting for ever:
 *
 * - the self-rescheduling sweeps (ADR-007): `ensureScheduled` finds the
 *   chain with nothing waiting and starts it again, so a cancel does nothing
 *   but hide a run;
 * - `subscription.charge`: a charge's steps hand on to each other, and a
 *   cancelled step strands the charge between them (D13);
 * - `site.go_live`: the release keeps its schedule, so the merchant would
 *   see "scheduled" for a go-live that never comes. The business cancels it
 *   from its Website, which deletes the job under the release's lock;
 * - `organization.deletion.cleanup` (#921): a deleted business would keep
 *   its billing, domains, files and keys, and nothing queues it again.
 *
 * The types are written out rather than imported so the console does not
 * load every module's handler; `job-cancel.spec.ts` pins them to the
 * modules' own constants.
 */
export const CANCEL_REFUSED: Readonly<Record<string, string>> = {
    "subscription.renew":
        "The renewal sweep runs itself again; cancelling a run would only hide it",
    "booking.release-holds":
        "The booking-hold sweep runs itself again; cancelling a run would only hide it",
    "payments.confirm-pending":
        "The pending-payment sweep runs itself again; cancelling a run would only hide it",
    "waitlist.retention":
        "The waitlist retention sweep runs itself again; cancelling a run would only hide it",
    "billing.moves.apply":
        "The plan-move sweep runs itself again; cancelling a run would only hide it",
    "analytics.rollup":
        "The Insights rollup runs itself again; cancelling a run would only hide it",
    "organization.deletion":
        "The deletion sweep runs itself again; cancelling a run would only hide it",
    "subscription.charge":
        "A step of an autopay charge; cancelling it would strand the charge",
    "site.go_live":
        "A scheduled go-live; the business cancels it from its Website, which keeps the release in step",
    "organization.retention.erase":
        "The retention eraser runs itself again; cancelling a run would only hide it",
    "security-logs.retention":
        "The security log retention sweep runs itself again; cancelling a run would only hide it",
    "organization.deletion.cleanup":
        "A deleted business's clean-up; cancelling it would leave its billing, domains, files and keys behind",
};

export interface CancelVerdict {
    targetId: string;
    verdict: "act" | "skip" | "unsafe";
    detail: string;
}

/**
 * What cancelling each job would do (dry run and execution share it). Only
 * a job that has not started, or is waiting to retry, is cancelled: a
 * running one is never stopped half way, and a finished one has nothing to
 * call off.
 */
export async function classifyJobCancels(
    ids: string[],
): Promise<CancelVerdict[]> {
    const jobs = await prisma.job.findMany({
        where: { id: { in: ids } },
        select: {
            id: true,
            type: true,
            status: true,
            attempts: true,
            maxAttempts: true,
        },
    });
    const byId = new Map(jobs.map((job) => [job.id, job]));

    return ids.map((id): CancelVerdict => {
        const job = byId.get(id);
        if (!job) {
            return { targetId: id, verdict: "skip", detail: "Job not found" };
        }
        if (job.status === "PROCESSING") {
            return {
                targetId: id,
                verdict: "unsafe",
                detail: "Running now; a job is never stopped half way",
            };
        }
        if (job.status !== "PENDING") {
            return {
                targetId: id,
                verdict: "skip",
                detail: `Nothing to cancel — it is ${job.status.toLowerCase()}`,
            };
        }
        const refused = CANCEL_REFUSED[job.type];
        if (refused) {
            return { targetId: id, verdict: "unsafe", detail: refused };
        }
        return {
            targetId: id,
            verdict: "act",
            detail:
                job.attempts === 0
                    ? `Cancel ${job.type} before it runs`
                    : `Cancel ${job.type}, waiting to retry after ${job.attempts} of ${job.maxAttempts} tries`,
        };
    });
}

/**
 * Cancel one job, classified again now so a job that changed since the dry
 * run is not cancelled on a stale answer. The write is fenced on PENDING:
 * a worker that claims it first wins, and the cancel says so.
 */
export async function cancelJob(
    id: string,
): Promise<{ status: "DONE" | "SKIPPED"; detail?: string }> {
    const verdict = (await classifyJobCancels([id]))[0] as
        CancelVerdict | undefined;
    if (verdict?.verdict !== "act") {
        return { status: "SKIPPED", detail: verdict?.detail };
    }
    const updated = await prisma.job.updateMany({
        where: { id, status: "PENDING" },
        data: {
            status: JOB_CANCELLED,
            processedAt: new Date(),
            lockedAt: null,
            lockedBy: null,
        },
    });
    return updated.count === 1
        ? { status: "DONE", detail: "Cancelled; it will not run" }
        : { status: "SKIPPED", detail: "It started before it was cancelled" };
}

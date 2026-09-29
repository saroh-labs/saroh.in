import type { Prisma } from "@saroh/database";

/**
 * Enqueueing `waitlist.offer` (round-2 A12): a place in a class freed — a
 * booking cancelled or moved away, a pay-now hold let go or run out, an
 * offer nobody answered — so the first person in line may be offered it.
 * Plain functions on the caller's transaction (the outbox, DEC-008), so the
 * booking writers need no Nest wiring to call them. The handler is
 * `waitlist-offer.handler.ts`, which counts what is free when it runs.
 *
 * Only a session someone is waiting for gets a job: the rest would be a
 * job the handler no-ops on (`backend-jobs.md`).
 */

/** The `type` the handler is registered under. */
export const WAITLIST_OFFER_TYPE = "waitlist.offer";

/** What `waitlist.offer` carries: the session, never who. */
export interface WaitlistOfferPayload {
    serviceId: string;
    /** The session's start, ISO. */
    startAt: string;
}

type Tx = Pick<Prisma.TransactionClient, "job" | "classWaitlistEntry">;

/**
 * A place in this session may have freed: queue an offer when anyone is in
 * line for it. `runAt` delays it (an offer's own expiry). Returns whether
 * one was queued.
 */
export async function offerFreedPlaceInTx(
    tx: Tx,
    input: {
        organizationId: string;
        serviceId: string;
        startAt: Date;
        runAt?: Date;
    },
): Promise<boolean> {
    const waiting = await tx.classWaitlistEntry.count({
        where: {
            organizationId: input.organizationId,
            serviceId: input.serviceId,
            startAt: input.startAt,
            status: "WAITING",
        },
    });
    if (waiting === 0) return false;
    const payload: WaitlistOfferPayload = {
        serviceId: input.serviceId,
        startAt: input.startAt.toISOString(),
    };
    await tx.job.create({
        data: {
            organizationId: input.organizationId,
            type: WAITLIST_OFFER_TYPE,
            payload: payload as unknown as Prisma.InputJsonObject,
            ...(input.runAt ? { runAt: input.runAt } : {}),
        },
        select: { id: true },
    });
    return true;
}

/**
 * The person took a place in this session (booked it through the normal
 * path, with a credit or a payment): their live place in its line — an
 * offer held for them, or a place still waiting — is ACCEPTED, naming the
 * booking.
 */
export async function acceptWaitlistInTx(
    tx: Pick<Prisma.TransactionClient, "classWaitlistEntry">,
    input: {
        serviceId: string;
        startAt: Date;
        contactId: string;
        bookingId: string;
        now: Date;
    },
): Promise<void> {
    await tx.classWaitlistEntry.updateMany({
        where: {
            serviceId: input.serviceId,
            startAt: input.startAt,
            contactId: input.contactId,
            status: { in: ["WAITING", "OFFERED"] },
        },
        data: {
            status: "ACCEPTED",
            bookingId: input.bookingId,
            closedAt: input.now,
        },
    });
}

/**
 * The class itself is cancelled (the team cancelled every place in it):
 * nobody in line can be offered a place, so each live entry is CLOSED and
 * nothing is queued.
 */
export async function closeSessionWaitlistInTx(
    tx: Pick<Prisma.TransactionClient, "classWaitlistEntry">,
    input: {
        organizationId: string;
        serviceId: string;
        startAt: Date;
        now: Date;
    },
): Promise<number> {
    const { count } = await tx.classWaitlistEntry.updateMany({
        where: {
            organizationId: input.organizationId,
            serviceId: input.serviceId,
            startAt: input.startAt,
            status: { in: ["WAITING", "OFFERED"] },
        },
        data: { status: "CLOSED", closedAt: input.now },
    });
    return count;
}

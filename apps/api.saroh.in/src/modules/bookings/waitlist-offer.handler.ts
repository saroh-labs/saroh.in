import { Injectable, Logger } from "@nestjs/common";
import type { Job } from "@saroh/database";
import { Prisma, prisma, runInOrgContext } from "@saroh/database";

import { offerSessionInTx } from "./waitlist-offer";
import type { WaitlistOfferPayload } from "./waitlist-queue";
import {
    closeSessionWaitlistInTx,
    WAITLIST_OFFER_TYPE,
} from "./waitlist-queue";

export { WAITLIST_OFFER_TYPE } from "./waitlist-queue";

/**
 * The `waitlist.offer` job (round-2 A12, R13): a place in a class may have
 * freed, so what is free now is offered to the first in line
 * (`offerSessionInTx`), each offer told through `customer.notify`.
 *
 * It carries only the session and re-reads everything: the place may have
 * been taken again meanwhile (nothing is offered), or two places may have
 * freed (two offers). A service archived or deleted since closes its lines.
 *
 * One transaction per run, in the business's RLS context, serializable and
 * under the service's row lock — the lock a join takes too — so two runs
 * for one session, or a run and a join, can't offer one place twice or
 * hand out one position twice; a booking racing it for the last place
 * loses to the serialization check, and the job's retry counts again.
 * Idempotent: a second run finds nothing more free.
 */
@Injectable()
export class WaitlistOfferHandler {
    private readonly logger = new Logger(WaitlistOfferHandler.name);

    readonly handle = async (job: Job): Promise<void> => {
        const payload = payloadOf(job.payload);
        if (!payload || !job.organizationId) {
            this.logger.warn(
                `${WAITLIST_OFFER_TYPE} job ${job.id} names no session; nothing to offer`,
            );
            return;
        }
        const organizationId = job.organizationId;
        const offered = await runInOrgContext(organizationId, () =>
            this.offer(organizationId, payload, new Date()),
        );
        if (offered > 0) {
            this.logger.log(
                `Offered ${offered} freed ${offered === 1 ? "place" : "places"} to the waitlist`,
            );
        }
    };

    /** Offer what is free in the session now. Returns how many offers. */
    async offer(
        organizationId: string,
        payload: WaitlistOfferPayload,
        now: Date,
    ): Promise<number> {
        const startAt = new Date(payload.startAt);
        return prisma.$transaction(
            async (tx) => {
                await tx.$queryRaw`SELECT id FROM "Service" WHERE id = ${payload.serviceId} FOR UPDATE`;
                const service = await tx.service.findFirst({
                    where: { id: payload.serviceId, organizationId },
                });
                if (!service) return 0;
                const session = {
                    organizationId,
                    serviceId: service.id,
                    startAt,
                    now,
                };
                // Off sale, or no longer a class: nobody is offered a place.
                if (
                    service.deletedAt !== null ||
                    service.status !== "ACTIVE" ||
                    service.capacity <= 1
                ) {
                    await closeSessionWaitlistInTx(tx, session);
                    return 0;
                }
                return (await offerSessionInTx(tx, service, startAt, now))
                    .length;
            },
            { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
    }
}

function payloadOf(value: unknown): WaitlistOfferPayload | null {
    if (typeof value !== "object" || value === null) return null;
    const p = value as Partial<WaitlistOfferPayload>;
    if (typeof p.serviceId !== "string" || p.serviceId === "") return null;
    if (typeof p.startAt !== "string") return null;
    if (Number.isNaN(Date.parse(p.startAt))) return null;
    return { serviceId: p.serviceId, startAt: p.startAt };
}

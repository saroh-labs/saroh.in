import {
    ConflictException,
    Injectable,
    Logger,
    Optional,
} from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { AuditAction, auditMetadata } from "../audit/audit.service";
import {
    cancelFoundBooking,
    sendCancelRefund,
} from "../bookings/booking-cancel";
import { allows } from "../organizations/organization-policy";
import {
    autopayRefusal,
    cancelAutopayFirst,
    openMandatesWhere,
} from "../payments/mandate-gate";
import { MandatesService } from "../payments/mandates.service";
import { PaymentsService } from "../payments/payments.service";
import { requireCustomerPower } from "./customer-access";
import { fullName } from "./merge-plan";
import type {
    RemovalGoes,
    RemovalRefusal,
    RemovalStays,
} from "./privacy-removal-plan";
import {
    countGoes,
    countStays,
    findContact,
    futureBookingsWhere,
    refusalsFor,
} from "./privacy-removal-reads";
import { removeDetailsInTx } from "./privacy-removal-writes";

/**
 * "Remove their details (privacy request)…" (DEC-042, C11): anonymise a
 * customer everywhere their details live, keeping issued invoices and the
 * orders' tax facts.
 *
 * In order:
 * 1. refused with an open order or a live subscription (default 25), for a
 *    tombstone (404) or someone already removed (404);
 * 2. their autopay cancelled at the provider first, through D20's
 *    `cancelFor` — an unsure or failed answer stops here with the sentence
 *    and nothing else changes; a retry is safe;
 * 3. their future bookings cancelled through the booking cancel, which
 *    returns pack credits (default 26), each in its own transaction;
 * 4. then one transaction under the contact's row lock (which serialises it
 *    with a merge and with `resolveContact` writers): the refusals checked
 *    again, every rule in `privacy-removal-plan.ts` applied
 *    (`privacy-removal-writes.ts`), and the `customer.removed` audit with
 *    ids and counts, never a value (DEC-035).
 *
 * `customer:remove`, on its own from the day it ships (R15): never implied
 * by `contact:write`.
 */

export interface RemovalPreview {
    contactId: string;
    /** Their name as the page shows it; null when they have none. */
    name: string | null;
    /** Why Remove can't go ahead yet; empty when it can. */
    refusals: RemovalRefusal[];
    goes: RemovalGoes;
    stays: RemovalStays;
}

export interface RemovalResult {
    contactId: string;
    removedAt: string;
    goes: RemovalGoes;
}

@Injectable()
export class PrivacyRemovalService {
    private readonly logger = new Logger(PrivacyRemovalService.name);

    constructor(
        @Optional() private readonly mandates?: MandatesService,
        @Optional() private readonly payments?: PaymentsService,
        @Optional() private readonly db: typeof prisma = prisma,
    ) {}

    /** What removing them would do, and anything that refuses it. */
    async preview(
        ctx: OrganizationContext,
        contactId: string,
        now: Date = new Date(),
    ): Promise<RemovalPreview> {
        requireCustomerPower(ctx, "customer:remove");
        return this.db.$transaction(async (tx) => {
            const contact = await findContact(
                tx,
                ctx.organizationId,
                contactId,
            );
            const [refusals, goes, stays] = await Promise.all([
                refusalsFor(tx, ctx.organizationId, contactId),
                countGoes(tx, ctx.organizationId, contactId, now),
                countStays(tx, ctx.organizationId, contactId),
            ]);
            return {
                contactId,
                name: fullName(contact),
                refusals,
                goes,
                stays,
            };
        });
    }

    /** Remove their details. Final. */
    async remove(
        ctx: OrganizationContext,
        contactId: string,
        now: Date = new Date(),
    ): Promise<RemovalResult> {
        requireCustomerPower(ctx, "customer:remove");
        const organizationId = ctx.organizationId;

        // 1. The refusals, before anything is touched.
        await this.db.$transaction(async (tx) => {
            await findContact(tx, organizationId, contactId);
            refuse(await refusalsFor(tx, organizationId, contactId));
        });

        // 2. Autopay ends at the provider first (D20, DEC-026).
        const autopay = await cancelAutopayFirst(
            this.db,
            this.mandates,
            { organizationId, contactId },
            "PRIVACY_REMOVAL",
        );
        if (!autopay.ok) {
            throw new ConflictException({
                message: autopayRefusal(autopay.provider, "removed"),
                details: { reason: "autopay" },
            });
        }

        // 3. Their future bookings, through the booking cancel: a pack's
        // class goes back, and money paid online follows the business's
        // refund policy, as when the business cancels.
        const cancelled = await this.cancelFutureBookings(ctx, contactId, now);

        // 4. Everything else, in one transaction under the contact's lock.
        const goes = await this.db.$transaction(async (tx) => {
            await tx.$queryRaw`SELECT id FROM "Contact"
                WHERE id = ${contactId} AND "organizationId" = ${organizationId}
                FOR UPDATE`;
            await findContact(tx, organizationId, contactId);
            refuse(await refusalsFor(tx, organizationId, contactId));
            const stillOpen = await tx.paymentMandate.findFirst({
                where: openMandatesWhere(organizationId, contactId),
                select: { provider: true },
            });
            if (stillOpen) {
                throw new ConflictException({
                    message: autopayRefusal(stillOpen.provider, "removed"),
                    details: { reason: "autopay" },
                });
            }
            // A booking made for them since step 3: said, not left live.
            const booked = await tx.booking.count({
                where: futureBookingsWhere(organizationId, contactId, now),
            });
            if (booked > 0) {
                throw new ConflictException(
                    "A booking was just made for them. Try again.",
                );
            }

            const written = await removeDetailsInTx(tx, {
                organizationId,
                contactId,
                userId: ctx.userId,
                now,
            });
            const result: RemovalGoes = {
                ...written,
                bookingsCancelled: cancelled,
                autopay: autopay.cancelled,
            };
            await tx.auditEvent.create({
                data: {
                    action: AuditAction.CustomerRemoved,
                    actorUserId: ctx.userId,
                    organizationId,
                    targetType: "contact",
                    targetId: contactId,
                    outcome: "SUCCESS",
                    // Ids and counts only: never a name, email or phone.
                    metadata: auditMetadata(ctx.roleKey, {
                        removed: countsOf(result),
                    }),
                },
            });
            return result;
        });

        this.logger.log(
            `Removed the details of contact ${contactId} (organization ${organizationId})`,
        );
        return { contactId, removedAt: now.toISOString(), goes };
    }

    private async cancelFutureBookings(
        ctx: OrganizationContext,
        contactId: string,
        now: Date,
    ): Promise<number> {
        const organizationId = ctx.organizationId;
        const future = await this.db.booking.findMany({
            where: futureBookingsWhere(organizationId, contactId, now),
            orderBy: { startAt: "asc" },
        });
        let cancelled = 0;
        for (const booking of future) {
            const done = await cancelFoundBooking(
                booking,
                {
                    organizationId,
                    userId: ctx.userId,
                    mayRefundByHand: allows(ctx, "payment:manage"),
                },
                now,
                { returnCredit: true },
                (refundId) =>
                    sendCancelRefund(
                        this.payments,
                        this.logger,
                        organizationId,
                        refundId,
                    ),
            );
            if (done.status === "CANCELLED" && booking.status !== "CANCELLED") {
                cancelled += 1;
            }
        }
        return cancelled;
    }
}

function refuse(refusals: RemovalRefusal[]): void {
    if (refusals.length === 0) return;
    throw new ConflictException({
        message: refusals[0].message,
        details: { reason: refusals[0].reason },
    });
}

/** The audit's counts: numbers and flags only. */
function countsOf(goes: RemovalGoes): Record<string, number | boolean> {
    return { ...goes };
}

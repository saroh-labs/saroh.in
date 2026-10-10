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
import {
    LEGAL_HOLD_CODE,
    LEGAL_HOLD_MESSAGE,
    legalHoldRefusal,
    onLegalHold,
    onLegalHoldLocked,
} from "../organizations/legal-hold";
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
 *
 * **Refused while the business is on legal hold** (DEC-119,
 * `organizations/legal-hold.ts`): its data is kept, a customer's details
 * included. The preview says so as its first refusal and Remove answers
 * 409 before anything is touched (and again under the business's row lock
 * in the last transaction); each writes `customer.removal.refused` to the
 * business's history, DENIED, with the contact's id and the reason as a
 * code. A held business is suspended or closing, so the workspace's own
 * lifecycle gate usually refuses the POST first; the preview is what the
 * dialog reads, which is why it records too.
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
        const preview = await this.db.$transaction(async (tx) => {
            const contact = await findContact(
                tx,
                ctx.organizationId,
                contactId,
            );
            const [held, refusals, goes, stays] = await Promise.all([
                onLegalHold(tx, ctx.organizationId),
                refusalsFor(tx, ctx.organizationId, contactId),
                countGoes(tx, ctx.organizationId, contactId, now),
                countStays(tx, ctx.organizationId, contactId),
            ]);
            return {
                held,
                view: {
                    contactId,
                    name: fullName(contact),
                    refusals: held ? [HOLD_REFUSAL, ...refusals] : refusals,
                    goes,
                    stays,
                },
            };
        });
        if (preview.held) await this.recordHoldRefusal(ctx, contactId);
        return preview.view;
    }

    /** Remove their details. Final. */
    async remove(
        ctx: OrganizationContext,
        contactId: string,
        now: Date = new Date(),
    ): Promise<RemovalResult> {
        requireCustomerPower(ctx, "customer:remove");
        const organizationId = ctx.organizationId;

        // 0. On legal hold nothing of the business's is removed (DEC-119).
        if (await onLegalHold(this.db, organizationId)) {
            await this.db.$transaction((tx) =>
                findContact(tx, organizationId, contactId),
            );
            await this.recordHoldRefusal(ctx, contactId);
            throw legalHoldRefusal();
        }

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
            // A hold placed since step 0 waits on this lock or stops here.
            if (await onLegalHoldLocked(tx, organizationId)) {
                throw legalHoldRefusal();
            }
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

    /**
     * The refusal on the business's history (DEC-119): who asked, for which
     * contact, and why, as a code. Ids only. A failed write is logged and
     * never turns the refusal into an error.
     */
    private async recordHoldRefusal(
        ctx: OrganizationContext,
        contactId: string,
    ): Promise<void> {
        try {
            await this.db.auditEvent.create({
                data: {
                    action: AuditAction.CustomerRemovalRefused,
                    actorUserId: ctx.userId,
                    organizationId: ctx.organizationId,
                    targetType: "contact",
                    targetId: contactId,
                    outcome: "DENIED",
                    metadata: auditMetadata(ctx.roleKey, {
                        reason: LEGAL_HOLD_CODE,
                    }),
                },
            });
        } catch (error) {
            this.logger.error(
                `customer_removal_refusal_not_recorded org=${ctx.organizationId} contact=${contactId} error=${error instanceof Error ? error.name : "unknown"}`,
            );
        }
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

/** The preview's first refusal for a business on legal hold. */
const HOLD_REFUSAL: RemovalRefusal = {
    reason: "legal-hold",
    message: LEGAL_HOLD_MESSAGE,
};

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

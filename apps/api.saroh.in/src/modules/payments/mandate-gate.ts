import type { Prisma } from "@saroh/database";

import type { MandateCancelReason } from "./mandate-cancel-job";
import { LIVE_MANDATE_STATUSES } from "./mandate-cancel-job";
import type { MandatesService } from "./mandates.service";

/**
 * A person's autopay must end at the provider before their record does
 * (D20, DEC-026): a privacy removal (C11) and a contact's hard delete both
 * ask here first. A standing authority to debit must never outlive the
 * record that says who gave it; and a hard delete cascades the mandate
 * rows, after which the `mandate.cancel` job would find nothing left to
 * ask about.
 *
 * Open: live (PENDING, ACTIVE, PAUSED), or CANCELLED in Saroh with the
 * provider's yes still to come.
 */
export function openMandatesWhere(
    organizationId: string,
    contactId: string,
): Prisma.PaymentMandateWhereInput {
    return {
        organizationId,
        contactId,
        OR: [
            { status: { in: [...LIVE_MANDATE_STATUSES] } },
            { status: "CANCELLED", cancelConfirmedAt: null },
        ],
    };
}

type Db = Pick<Prisma.TransactionClient, "paymentMandate">;

export type AutopayGate =
    { ok: true; cancelled: number } | { ok: false; provider: string | null };

/**
 * Cancel the contact's open mandates at the provider now, through D20's
 * `cancelFor`, and say whether any is still unconfirmed. Called before the
 * caller's own transaction; the caller refuses while `ok` is false, and
 * checks {@link openMandatesWhere} again under its lock. Safe to call
 * again: a confirmed mandate is skipped.
 *
 * Without the service (a unit built by hand), an open mandate refuses.
 */
export async function cancelAutopayFirst(
    db: Db,
    mandates: Pick<MandatesService, "cancelFor"> | undefined,
    scope: { organizationId: string; contactId: string },
    reason: MandateCancelReason,
): Promise<AutopayGate> {
    const open = await db.paymentMandate.findFirst({
        where: openMandatesWhere(scope.organizationId, scope.contactId),
        select: { provider: true },
    });
    if (!open) return { ok: true, cancelled: 0 };
    if (!mandates) return { ok: false, provider: open.provider };
    const result = await mandates.cancelFor(scope, reason);
    if (result.unconfirmed > 0) return { ok: false, provider: open.provider };
    return { ok: true, cancelled: result.cancelled };
}

const PROVIDER_NAMES: Readonly<Record<string, string>> = {
    razorpay: "Razorpay",
    cashfree: "Cashfree",
};

/** The provider as a merchant knows it. */
export function providerName(provider: string | null | undefined): string {
    const key = (provider ?? "").trim().toLowerCase();
    return PROVIDER_NAMES[key] ?? "your payment provider";
}

/**
 * The provider hasn't confirmed their autopay is cancelled (an unsure
 * answer or a refusal): nothing changed, and trying again is safe.
 */
export function autopayRefusal(
    provider: string | null | undefined,
    what: "removed" | "deleted",
): string {
    return `Their autopay couldn't be cancelled at ${providerName(provider)} yet, so nothing was ${what}. Try again in a few minutes`;
}

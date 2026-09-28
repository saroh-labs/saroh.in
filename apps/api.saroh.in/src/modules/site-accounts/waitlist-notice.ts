import type { Prisma } from "@saroh/database";

import type { CustomerNotifyPayload } from "./customer-notify-queue";
import type { NoticeVars } from "./notify-templates";

/**
 * What a waitlist offer's notice is about (round-2 A12, R13): the place in
 * line a freed place is held for, read again when `customer.notify` runs.
 * An offer taken, left or run out since it was queued tells nobody; the
 * handler resolves the contact (a merge reaches the survivor, a removal
 * nobody).
 */
export async function loadWaitlistOffer(
    tx: Pick<Prisma.TransactionClient, "classWaitlistEntry" | "organization">,
    organizationId: string,
    payload: CustomerNotifyPayload,
    now: Date,
): Promise<{ contactId: string; vars: NoticeVars } | null> {
    if (!payload.waitlistEntryId) return null;
    const entry = await tx.classWaitlistEntry.findFirst({
        where: { id: payload.waitlistEntryId, organizationId },
        select: {
            contactId: true,
            status: true,
            startAt: true,
            offeredUntil: true,
            service: { select: { name: true, timezone: true } },
            contact: { select: { firstName: true } },
            organization: { select: { name: true } },
        },
    });
    if (entry?.status !== "OFFERED" || !entry.offeredUntil) return null;
    if (entry.offeredUntil <= now) return null;
    const first = entry.contact.firstName?.trim().split(/\s+/)[0] ?? "";
    return {
        contactId: entry.contactId,
        vars: {
            kind: "WAITLIST_OFFER",
            waitlist: {
                business: entry.organization.name,
                firstName: first === "" ? null : first,
                service: entry.service.name,
                startAt: entry.startAt,
                heldUntil: entry.offeredUntil,
                timeZone: entry.service.timezone,
            },
        },
    };
}

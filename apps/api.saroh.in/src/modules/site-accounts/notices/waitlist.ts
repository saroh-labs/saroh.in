import { defineNotice, firstWord, noticeWhen } from "./notice";

/**
 * A waitlist offer (round-2 A12, R13): the place in line a freed place is
 * held for, read again when `customer.notify` runs. An offer taken, left or
 * run out since it was queued tells nobody; the handler resolves the
 * contact (a merge reaches the survivor, a removal nobody).
 */

export interface WaitlistNoticeVars {
    business: string;
    firstName: string | null;
    service: string;
    startAt: Date;
    /** Until when the place is held for them. */
    heldUntil: Date;
    timeZone: string;
}

export interface WaitlistNotice {
    kind: "WAITLIST_OFFER";
    waitlist: WaitlistNoticeVars;
}

export const waitlistNotice = defineNotice<WaitlistNotice>({
    setting: null,
    load: async (tx, organizationId, payload, now) => {
        if (payload.kind !== "WAITLIST_OFFER" || !payload.waitlistEntryId) {
            return null;
        }
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
        return {
            contactId: entry.contactId,
            vars: {
                kind: "WAITLIST_OFFER",
                waitlist: {
                    business: entry.organization.name,
                    firstName: firstWord(entry.contact.firstName),
                    service: entry.service.name,
                    startAt: entry.startAt,
                    heldUntil: entry.offeredUntil,
                    timeZone: entry.service.timezone,
                },
            },
        };
    },
    sentence: ({ waitlist: w }) =>
        `A place opened in ${w.service} on ${noticeWhen(w.startAt, w.timeZone)}. It's held for you until ${noticeWhen(w.heldUntil, w.timeZone)}.`,
    subject: ({ waitlist }) => `A place opened at ${waitlist.business}`,
    names: ({ waitlist }) => ({
        business: waitlist.business,
        firstName: waitlist.firstName,
    }),
});

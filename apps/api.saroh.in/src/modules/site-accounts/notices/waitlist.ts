import { siteCodeSecret } from "../site-secrets";
import { waitlistClaimUrl } from "../waitlist-claim";
import { defineNotice, firstWord, noticeWhen } from "./notice";

/**
 * A waitlist offer (round-2 A12, R13): the place in line a freed place is
 * held for, read again when `customer.notify` runs. An offer taken, left or
 * run out since it was queued tells nobody; the handler resolves the
 * contact (a merge reaches the survivor, a removal nobody).
 *
 * The email carries the claim link (U18, #1149): the class on the
 * business's site with "Book my spot" until the hold ends
 * (`waitlist-claim.ts`, which signs it).
 */

export interface WaitlistNoticeVars {
    business: string;
    firstName: string | null;
    service: string;
    startAt: Date;
    /** Until when the place is held for them. */
    heldUntil: Date;
    timeZone: string;
    /**
     * The claim page on the business's site (`waitlist-claim.ts`); null or
     * absent: the email has no link.
     */
    link?: string | null;
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
        const link = await waitlistClaimUrl(
            tx,
            organizationId,
            {
                entryId: payload.waitlistEntryId,
                contactId: entry.contactId,
                offeredUntil: entry.offeredUntil,
            },
            siteCodeSecret,
        );
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
                    link,
                },
            },
        };
    },
    sentence: ({ waitlist: w }) =>
        `A place opened in ${w.service} on ${noticeWhen(w.startAt, w.timeZone)}. It's held for you until ${noticeWhen(w.heldUntil, w.timeZone)}.`,
    subject: ({ waitlist }) => `A place opened at ${waitlist.business}`,
    // The claim page (#1149): the class, and "Book my spot".
    backLink: ({ waitlist }) =>
        waitlist.link
            ? { lead: "Book your place before then:", url: waitlist.link }
            : null,
    names: ({ waitlist }) => ({
        business: waitlist.business,
        firstName: waitlist.firstName,
    }),
});

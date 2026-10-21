import type { Prisma } from "@saroh/database";

import { siteCodeSecret } from "../site-secrets";
import { waitlistClaimUrl } from "../waitlist-claim";
import type { NoticeSubject } from "./notice";
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
 *
 * A class the business cancelled as a whole (U17, #1148) tells everyone
 * still in its line that it is off (WAITLIST_CLASS_CANCELLED, queued by
 * `closeSessionWaitlistInTx` with `tell`). No switch: it fixes a line that
 * used to close silently.
 */

export interface WaitlistNoticeVars {
    business: string;
    firstName: string | null;
    service: string;
    startAt: Date;
    /** Until when the place is held for them (an offer). */
    heldUntil: Date;
    timeZone: string;
    /**
     * The claim page on the business's site (`waitlist-claim.ts`); null or
     * absent: the email has no link.
     */
    link?: string | null;
}

/** A class they were waiting for, cancelled by the business (U17). */
export type WaitlistClassCancelledVars = Omit<
    WaitlistNoticeVars,
    "heldUntil" | "link"
>;

export type WaitlistNotice =
    | { kind: "WAITLIST_OFFER"; waitlist: WaitlistNoticeVars }
    | {
          kind: "WAITLIST_CLASS_CANCELLED";
          waitlist: WaitlistClassCancelledVars;
      };

export const waitlistNotice = defineNotice<WaitlistNotice>({
    setting: null,
    load: async (tx, organizationId, payload, now) => {
        if (
            payload.kind === "WAITLIST_CLASS_CANCELLED" &&
            payload.waitlistEntryId
        ) {
            return loadClassCancelled(
                tx,
                organizationId,
                payload.waitlistEntryId,
            );
        }
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
    sentence: (vars) =>
        vars.kind === "WAITLIST_CLASS_CANCELLED"
            ? `${vars.waitlist.business} cancelled ${vars.waitlist.service} on ${noticeWhen(vars.waitlist.startAt, vars.waitlist.timeZone)}, the class you were waiting for. You're no longer on its waitlist.`
            : `A place opened in ${vars.waitlist.service} on ${noticeWhen(vars.waitlist.startAt, vars.waitlist.timeZone)}. It's held for you until ${noticeWhen(vars.waitlist.heldUntil, vars.waitlist.timeZone)}.`,
    subject: ({ kind, waitlist }) =>
        kind === "WAITLIST_CLASS_CANCELLED"
            ? `${waitlist.business} cancelled ${waitlist.service}`
            : `A place opened at ${waitlist.business}`,
    // The claim page (#1149): the class, and "Book my spot".
    backLink: (vars) =>
        vars.kind === "WAITLIST_OFFER" && vars.waitlist.link
            ? { lead: "Book your place before then:", url: vars.waitlist.link }
            : null,
    names: ({ waitlist }) => ({
        business: waitlist.business,
        firstName: waitlist.firstName,
    }),
});

/**
 * A place in line for a class the business cancelled (U17): told only
 * while the entry is still the one the cancel closed.
 */
async function loadClassCancelled(
    tx: Prisma.TransactionClient,
    organizationId: string,
    entryId: string,
): Promise<NoticeSubject<WaitlistNotice> | null> {
    const entry = await tx.classWaitlistEntry.findFirst({
        where: { id: entryId, organizationId },
        select: {
            contactId: true,
            status: true,
            startAt: true,
            service: { select: { name: true, timezone: true } },
            contact: { select: { firstName: true } },
            organization: { select: { name: true } },
        },
    });
    if (entry?.status !== "CLOSED") return null;
    return {
        contactId: entry.contactId,
        vars: {
            kind: "WAITLIST_CLASS_CANCELLED",
            waitlist: {
                business: entry.organization.name,
                firstName: firstWord(entry.contact.firstName),
                service: entry.service.name,
                startAt: entry.startAt,
                timeZone: entry.service.timezone,
            },
        },
    };
}

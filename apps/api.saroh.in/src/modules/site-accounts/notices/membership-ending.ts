import { dayWords, isTimeZone } from "../../../common/words-format";
import { defineNotice, firstWord } from "./notice";

/**
 * A membership set to end is a week away (DEC-174 U19, #1150): "Your
 * Monthly yoga membership ends on Wed 28 Oct 2026. To keep it, let us know
 * before then", with the way back to their Messages on the business's site.
 * Under Membership emails (MEMBERSHIP), like the other membership notices.
 *
 * Queued by the daily sweep (`subscriptions/membership-ending.handler.ts`),
 * once per membership and end date (`membershipEndingNoticeKey`). Read again
 * when it runs: a membership kept since (no longer set to end), ended
 * already, or now ending on another day tells nobody.
 *
 * A member can't take back a cancel from their account (only the team
 * can, with Keep), so the email asks them to get in touch, not to press
 * something that isn't there.
 */

export interface MembershipEndingVars {
    business: string;
    firstName: string | null;
    plan: string;
    /** When it ends: its last period's end. */
    endsAt: Date;
    timeZone: string;
    /** Their Messages on the business's site, when there is one. */
    link: string | null;
}

export interface MembershipEndingNotice {
    kind: "MEMBERSHIP_ENDING";
    ending: MembershipEndingVars;
}

/** Once per membership and the day it ends. */
export function membershipEndingNoticeKey(
    subscriptionId: string,
    endsAt: Date,
): string {
    return `membership-ending:${subscriptionId}:${endsAt.toISOString()}`;
}

function endsOn(m: MembershipEndingVars): string {
    const zone = isTimeZone(m.timeZone) ? m.timeZone : "Asia/Kolkata";
    return dayWords(m.endsAt, zone, { weekday: true, year: true });
}

/** The sentence: the thread's message and the email's lead. Plain text. */
export function membershipEndingSentence(m: MembershipEndingVars): string {
    return `Your ${m.plan} membership ends on ${endsOn(m)}. Nothing more will be charged. To keep it, let us know before then.`;
}

export const membershipEndingNotice = defineNotice<MembershipEndingNotice>({
    setting: "MEMBERSHIP",
    load: async (tx, organizationId, payload, now) => {
        if (
            payload.kind !== "MEMBERSHIP_ENDING" ||
            !payload.subscriptionId ||
            !payload.periodEnd
        ) {
            return null;
        }
        const sub = await tx.customerSubscription.findFirst({
            where: { id: payload.subscriptionId, organizationId },
            select: {
                contactId: true,
                status: true,
                cancelAtPeriodEnd: true,
                currentPeriodEnd: true,
                timezone: true,
                plan: { select: { name: true } },
                contact: { select: { firstName: true } },
                organization: { select: { name: true } },
            },
        });
        // Kept since, ended already, or its end moved: nothing to say.
        if (
            !sub ||
            (sub.status !== "ACTIVE" && sub.status !== "PAUSED") ||
            !sub.cancelAtPeriodEnd ||
            sub.currentPeriodEnd.toISOString() !== payload.periodEnd ||
            sub.currentPeriodEnd.getTime() <= now.getTime()
        ) {
            return null;
        }
        return {
            contactId: sub.contactId,
            vars: {
                kind: "MEMBERSHIP_ENDING",
                ending: {
                    business: sub.organization.name,
                    firstName: firstWord(sub.contact.firstName),
                    plan: sub.plan.name,
                    endsAt: sub.currentPeriodEnd,
                    timeZone: sub.timezone,
                    link: null,
                },
            },
        };
    },
    sentence: ({ ending }) => membershipEndingSentence(ending),
    subject: ({ ending }) =>
        `Your membership at ${ending.business} ends on ${endsOn(ending)}`,
    names: ({ ending }) => ({
        business: ending.business,
        firstName: ending.firstName,
    }),
    backLink: ({ ending }) =>
        ending.link
            ? { lead: "To keep it, send us a message:", url: ending.link }
            : null,
    withLink: (vars, link) => ({ ...vars, ending: { ...vars.ending, link } }),
});

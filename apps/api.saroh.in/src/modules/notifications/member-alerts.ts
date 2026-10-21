import type { Prisma } from "@saroh/database";

import { dayWords, isTimeZone } from "../../common/words-format";
import { cleanBusinessName } from "../site-accounts/sender-name";
import { noticeOf } from "./notice-target";
import type { TeamAlertPayload, WordedAlert } from "./team-alerts";

/**
 * "Members" (DEC-174 U19, #1150): the team hears when a member cancels or
 * pauses their own membership from their account, or when their bank
 * cancels its autopay. Bell on and email off by default, offered to whoever
 * reads memberships (`subscription:read`) while Payments is on.
 *
 * Nobody is told of a change the team made: only the member's own events
 * (`CUSTOMER`) and the bank's cancel (`PROVIDER`) queue one.
 *
 * Read again when it runs: a pause the member already took back, a cancel
 * kept since, or autopay set up again (or the membership ended) says
 * nothing. The bell names the member; Saroh's email names nobody, and
 * carries the plan's name cleaned (DEC-011 as amended 2026-10-07).
 */

export const MEMBER_CANCELLED_NOTIFICATION_TYPE = "member.cancelled" as const;
export const MEMBER_PAUSED_NOTIFICATION_TYPE = "member.paused" as const;
export const MEMBER_AUTOPAY_OFF_NOTIFICATION_TYPE =
    "member.autopay_off" as const;

type Tx = Prisma.TransactionClient;
type MemberPayload = Extract<TeamAlertPayload, { event: "member" }>;

const SUB_SELECT = {
    id: true,
    status: true,
    cancelAtPeriodEnd: true,
    currentPeriodEnd: true,
    pausedUntil: true,
    timezone: true,
    contactId: true,
    plan: { select: { name: true } },
    contact: { select: { firstName: true, lastName: true } },
} as const;

/** The alert, worded; null when it no longer stands. */
export async function wordMember(
    tx: Tx,
    organizationId: string,
    p: MemberPayload,
): Promise<WordedAlert | null> {
    const sub = await tx.customerSubscription.findFirst({
        where: { id: p.subscriptionId, organizationId },
        select: SUB_SELECT,
    });
    if (!sub) return null;
    const who = memberName(sub.contact);
    const plan = sub.plan.name;
    const planMail = cleanBusinessName(plan, "A membership");
    const zone = isTimeZone(sub.timezone) ? sub.timezone : "Asia/Kolkata";
    const day = (at: Date) => dayWords(at, zone, { year: true });
    const base = {
        event: "member" as const,
        notificationId: null,
        path: `/billing/subscriptions/${sub.id}`,
        skipUserId: null,
        cta: "Open the membership",
    };

    if (p.change === "autopay_off") {
        const mandate = await tx.paymentMandate.findFirst({
            where: {
                id: p.mandateId,
                organizationId,
                subscriptionId: sub.id,
            },
            select: { status: true, cancelReason: true },
        });
        if (
            mandate?.status !== "CANCELLED" ||
            mandate.cancelReason !== "PROVIDER"
        ) {
            return null;
        }
        // The membership ended, or autopay is set up again.
        if (sub.status === "CANCELLED") return null;
        const again = await tx.paymentMandate.findFirst({
            where: {
                organizationId,
                subscriptionId: sub.id,
                status: { in: ["ACTIVE", "PAUSED"] },
            },
            select: { id: true },
        });
        if (again) return null;
        const after =
            "Renewals won't be charged by autopay now: they'll pay each invoice themselves, unless autopay is set up again.";
        return {
            ...base,
            eventKey: `team:member:autopay_off:${p.mandateId}`,
            ...noticeOf(MEMBER_AUTOPAY_OFF_NOTIFICATION_TYPE, {
                contactId: sub.contactId,
            }),
            title: `${who} turned off autopay for ${plan} at their bank`,
            body: after,
            mail: {
                heading: "A member turned off autopay at their bank",
                body: `${planMail}. ${after} Open it in Saroh to see who.`,
            },
        };
    }

    const event = await tx.subscriptionEvent.findFirst({
        where: {
            id: p.eventId,
            organizationId,
            subscriptionId: sub.id,
            actorKind: "CUSTOMER",
        },
        select: { id: true, kind: true },
    });
    if (!event) return null;
    const eventKey = `team:member:${event.id}`;

    if (p.change === "paused") {
        // Started again since: nothing to say.
        if (event.kind !== "PAUSED" || sub.status !== "PAUSED") return null;
        const until = sub.pausedUntil
            ? `Until ${day(sub.pausedUntil)}. No charges until then, and their classes are on hold.`
            : "Until they start it again. No charges while it's paused, and their classes are on hold.";
        return {
            ...base,
            eventKey,
            ...noticeOf(MEMBER_PAUSED_NOTIFICATION_TYPE, {
                contactId: sub.contactId,
            }),
            title: `${who} paused their ${plan} membership`,
            body: until,
            mail: {
                heading: "A member paused their membership",
                body: `${planMail}. ${until} Open it in Saroh to see who.`,
            },
        };
    }

    let ends: string;
    if (event.kind === "CANCELLED") {
        ends = "It has ended. Nothing more will be charged.";
    } else if (event.kind === "CANCEL_SCHEDULED") {
        // Kept since (by the team): it carries on.
        if (sub.status !== "CANCELLED" && !sub.cancelAtPeriodEnd) return null;
        ends = `It ends on ${day(sub.currentPeriodEnd)}. Nothing more will be charged.`;
    } else {
        return null;
    }
    return {
        ...base,
        eventKey,
        ...noticeOf(MEMBER_CANCELLED_NOTIFICATION_TYPE, {
            contactId: sub.contactId,
        }),
        title: `${who} cancelled their ${plan} membership`,
        body: ends,
        mail: {
            heading: "A member cancelled their membership",
            body: `${planMail}. ${ends} Open it in Saroh to see who.`,
        },
    };
}

/** "Asha Rao", or "A member". */
function memberName(contact: {
    firstName: string | null;
    lastName: string | null;
}): string {
    const name = [contact.firstName, contact.lastName]
        .filter(Boolean)
        .join(" ")
        .trim();
    return name === "" ? "A member" : name;
}

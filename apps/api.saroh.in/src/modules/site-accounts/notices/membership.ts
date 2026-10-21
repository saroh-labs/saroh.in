import type { Prisma } from "@saroh/database";

import { toMinor } from "../../../common/money";
import { dayWords, moneyWordsMinor } from "../../../common/words-format";
import type { CustomerNotifyPayload } from "../customer-notify-queue";
import { defineNotice, firstWord } from "./notice";

/**
 * A member's membership changed (DEC-174 U11, #1142): joined, paused,
 * resumed, plan changed (booked, called off or taken effect), cancelled
 * (today, or at the period's end) and a cancel taken back. One switch,
 * MEMBERSHIP. Each is keyed to the `SubscriptionEvent` it is about
 * (`membershipNoticeKey`) and queued with it (`membership-notices.ts`).
 *
 * When it runs, the event and the membership are read again: a change
 * undone since (a pause resumed, a cancel kept, a booked plan change
 * replaced) tells nobody. The words say what happens to the money and the
 * classes, in the membership's own zone.
 */

export const MEMBERSHIP_NOTICE_KINDS = [
    "MEMBERSHIP_JOINED",
    "MEMBERSHIP_PAUSED",
    "MEMBERSHIP_RESUMED",
    "MEMBERSHIP_PLAN_CHANGED",
    "MEMBERSHIP_CANCELLED",
    "MEMBERSHIP_KEPT",
] as const;
export type MembershipNoticeKind = (typeof MEMBERSHIP_NOTICE_KINDS)[number];

/** Which of a kind's sentences, from the event it is about. */
export type MembershipVariant =
    | "JOINED"
    | "STARTS_LATER"
    | "PAUSED"
    | "PAUSED_OPEN"
    | "RESUMED"
    | "CANCELLED_NOW"
    | "CANCELS_AT_END"
    | "KEPT"
    | "PLAN_CHANGE_BOOKED"
    | "PLAN_CHANGE_CALLED_OFF"
    | "PLAN_CHANGED";

export interface MembershipNoticeVars {
    business: string;
    firstName: string | null;
    variant: MembershipVariant;
    /** The plan it is on now, or for a plan change, the one it leaves. */
    plan: string;
    /** The plan it moves to (a plan change), or the move called off. */
    toPlan: string | null;
    /** What it costs each time, in minor units (paise), with how often. */
    priceMinor: number | null;
    currency: string;
    interval: string;
    /** Classes a period; null: none counted. */
    classes: number | null;
    /**
     * The day that matters: the next renewal, the pause's end, the last
     * day of a cancel at period end, the start, or a booked change's day.
     */
    on: Date | null;
    timeZone: string;
}

export interface MembershipNotice {
    kind: MembershipNoticeKind;
    membership: MembershipNoticeVars;
}

/** The SubscriptionEvent kinds a member is told about, and as which notice. */
export const MEMBERSHIP_NOTICE_OF: Partial<
    Record<string, MembershipNoticeKind>
> = {
    SUBSCRIBED: "MEMBERSHIP_JOINED",
    PAUSED: "MEMBERSHIP_PAUSED",
    RESUMED: "MEMBERSHIP_RESUMED",
    CANCELLED: "MEMBERSHIP_CANCELLED",
    CANCEL_SCHEDULED: "MEMBERSHIP_CANCELLED",
    KEPT: "MEMBERSHIP_KEPT",
    PLAN_CHANGE_BOOKED: "MEMBERSHIP_PLAN_CHANGED",
    PLAN_CHANGE_CANCELLED: "MEMBERSHIP_PLAN_CHANGED",
    PLAN_CHANGED: "MEMBERSHIP_PLAN_CHANGED",
};

/** A membership notice's key: its SubscriptionEvent, once per change. */
export function membershipNoticeKey(subscriptionEventId: string): string {
    return `membership:${subscriptionEventId}`;
}

type Tx = Prisma.TransactionClient;

type Json = Prisma.JsonValue;

function field(data: Json, key: string): Json | undefined {
    return data !== null && typeof data === "object" && !Array.isArray(data)
        ? (data as Record<string, Json>)[key]
        : undefined;
}

function text(value: Json | undefined): string | null {
    return typeof value === "string" && value !== "" ? value : null;
}

function day(value: Json | undefined): Date | null {
    const iso = text(value);
    if (!iso) return null;
    const at = new Date(iso);
    return Number.isNaN(at.getTime()) ? null : at;
}

/** A plan as an event names it (`EventPlanRef`). */
function planOf(value: Json | undefined): {
    id: string | null;
    name: string | null;
    priceMinor: number | null;
    currency: string | null;
    interval: string | null;
} {
    const price = text(field(value ?? null, "price"));
    const minor = price ? toMinor(price) : null;
    const priceMinor = minor !== null && Number.isFinite(minor) ? minor : null;
    return {
        id: text(field(value ?? null, "id")),
        name: text(field(value ?? null, "name")),
        priceMinor,
        currency: text(field(value ?? null, "currency")),
        interval: text(field(value ?? null, "interval")),
    };
}

async function loadMembership(
    tx: Tx,
    organizationId: string,
    payload: CustomerNotifyPayload,
): Promise<{
    contactId: string;
    vars: MembershipNotice;
} | null> {
    const kind = payload.kind as MembershipNoticeKind;
    if (
        !(MEMBERSHIP_NOTICE_KINDS as readonly string[]).includes(kind) ||
        !payload.subscriptionEventId
    ) {
        return null;
    }
    const event = await tx.subscriptionEvent.findFirst({
        where: { id: payload.subscriptionEventId, organizationId },
        select: {
            kind: true,
            data: true,
            subscription: {
                select: {
                    contactId: true,
                    status: true,
                    cancelAtPeriodEnd: true,
                    currentPeriodEnd: true,
                    pendingPlanId: true,
                    price: true,
                    currency: true,
                    interval: true,
                    timezone: true,
                    classesPerPeriod: true,
                    plan: { select: { name: true, classesPerMonth: true } },
                    contact: { select: { firstName: true } },
                    organization: { select: { name: true } },
                },
            },
        },
    });
    if (!event || MEMBERSHIP_NOTICE_OF[event.kind] !== kind) return null;
    const sub = event.subscription;
    const data = event.data;
    const live = sub.status !== "CANCELLED";
    const running = sub.status === "ACTIVE";
    const base = {
        business: sub.organization.name,
        firstName: firstWord(sub.contact.firstName),
        plan: sub.plan.name,
        toPlan: null,
        priceMinor: toMinor(sub.price),
        currency: sub.currency,
        interval: sub.interval,
        classes: sub.classesPerPeriod ?? sub.plan.classesPerMonth,
        on: null,
        timeZone: sub.timezone,
    } satisfies Omit<MembershipNoticeVars, "variant">;

    let membership: MembershipNoticeVars | null = null;
    switch (event.kind) {
        case "SUBSCRIBED": {
            if (!live) break;
            const plan = planOf(field(data, "plan"));
            const startsAt = day(field(data, "startsAt"));
            membership = {
                ...base,
                variant: startsAt ? "STARTS_LATER" : "JOINED",
                plan: plan.name ?? base.plan,
                priceMinor: plan.priceMinor ?? base.priceMinor,
                currency: plan.currency ?? base.currency,
                interval: plan.interval ?? base.interval,
                on: startsAt ?? sub.currentPeriodEnd,
            };
            break;
        }
        case "PAUSED": {
            // Resumed (or cancelled) since: nothing to say.
            if (sub.status !== "PAUSED") break;
            const until = day(field(data, "until"));
            membership = {
                ...base,
                variant: until ? "PAUSED" : "PAUSED_OPEN",
                on: until,
            };
            break;
        }
        case "RESUMED":
            if (!running) break;
            membership = {
                ...base,
                variant: "RESUMED",
                on: sub.currentPeriodEnd,
            };
            break;
        case "CANCELLED":
            if (live) break;
            membership = { ...base, variant: "CANCELLED_NOW" };
            break;
        case "CANCEL_SCHEDULED":
            // Kept since: it carries on, and nobody is told it ends.
            if (!running || !sub.cancelAtPeriodEnd) break;
            membership = {
                ...base,
                variant: "CANCELS_AT_END",
                on: day(field(data, "endsAt")) ?? sub.currentPeriodEnd,
            };
            break;
        case "KEPT":
            if (!live || sub.cancelAtPeriodEnd) break;
            membership = {
                ...base,
                variant: "KEPT",
                on: running ? sub.currentPeriodEnd : null,
            };
            break;
        case "PLAN_CHANGE_BOOKED": {
            const to = planOf(field(data, "to"));
            // Replaced or called off since, or the membership ended.
            if (!live || !to.id || sub.pendingPlanId !== to.id) break;
            membership = {
                ...base,
                variant: "PLAN_CHANGE_BOOKED",
                toPlan: to.name,
                priceMinor: to.priceMinor,
                currency: to.currency ?? base.currency,
                interval: to.interval ?? base.interval,
                classes: null,
                on: day(field(data, "from")) ?? sub.currentPeriodEnd,
            };
            break;
        }
        case "PLAN_CHANGE_CANCELLED": {
            const off = planOf(field(data, "plan"));
            if (!live || sub.pendingPlanId !== null || !off.name) break;
            membership = {
                ...base,
                variant: "PLAN_CHANGE_CALLED_OFF",
                toPlan: off.name,
            };
            break;
        }
        case "PLAN_CHANGED": {
            if (!live) break;
            const from = planOf(field(data, "from"));
            const to = planOf(field(data, "to"));
            membership = {
                ...base,
                variant: "PLAN_CHANGED",
                plan: from.name ?? base.plan,
                toPlan: to.name ?? base.plan,
                priceMinor: to.priceMinor ?? base.priceMinor,
                currency: to.currency ?? base.currency,
                interval: to.interval ?? base.interval,
                on: sub.currentPeriodEnd,
            };
            break;
        }
    }
    return membership
        ? { contactId: sub.contactId, vars: { kind, membership } }
        : null;
}

const EVERY: Record<string, string> = {
    WEEK: "a week",
    MONTH: "a month",
    QUARTER: "every 3 months",
    YEAR: "a year",
};

/** "₹1,200 a month"; null when the price isn't known. */
export function priceWords(m: MembershipNoticeVars): string | null {
    if (m.priceMinor === null) return null;
    const every = EVERY[m.interval];
    const money = moneyWordsMinor(m.priceMinor, m.currency);
    return every ? `${money} ${every}` : money;
}

function on(m: MembershipNoticeVars): string {
    return m.on ? dayWords(m.on, m.timeZone, { year: true }) : "";
}

function classesWords(m: MembershipNoticeVars): string {
    if (m.classes === null) return "";
    const per = m.interval === "WEEK" ? "a week" : "a month";
    return ` It includes ${m.classes} ${m.classes === 1 ? "class" : "classes"} ${per}.`;
}

/** The sentence: the thread's message and the email's lead. Plain text. */
export function membershipSentence(m: MembershipNoticeVars): string {
    const price = priceWords(m);
    const at = price ? `, at ${price}` : "";
    switch (m.variant) {
        case "JOINED":
            return `You've joined ${m.plan}${at}. It renews next on ${on(m)}.${classesWords(m)}`;
        case "STARTS_LATER":
            return `You've joined ${m.plan}${at}. It starts on ${on(m)}, and nothing is charged before then.${classesWords(m)}`;
        case "PAUSED":
            return `Your ${m.plan} membership is paused until ${on(m)}. No charges until ${on(m)}; your classes are on hold. It starts again on its own.`;
        case "PAUSED_OPEN":
            return `Your ${m.plan} membership is paused. No charges while it's paused; your classes are on hold until it starts again.`;
        case "RESUMED":
            return `Your ${m.plan} membership has started again, and your classes are back. It renews next on ${on(m)}.`;
        case "CANCELLED_NOW":
            return `Your ${m.plan} membership is cancelled and has ended today. Nothing more will be charged.`;
        case "CANCELS_AT_END":
            return `Your ${m.plan} membership is cancelled. You keep your classes until ${on(m)}, and nothing more will be charged.`;
        case "KEPT":
            return m.on
                ? `Your ${m.plan} membership carries on: it's no longer set to end. It renews next on ${on(m)}.`
                : `Your ${m.plan} membership carries on: it's no longer set to end.`;
        case "PLAN_CHANGE_BOOKED":
            return `From ${on(m)}, your membership moves from ${m.plan} to ${m.toPlan ?? "a new plan"}${at}. Nothing changes until then.`;
        case "PLAN_CHANGE_CALLED_OFF":
            return `Your membership stays on ${m.plan}. The move to ${m.toPlan ?? "another plan"} won't happen.`;
        case "PLAN_CHANGED":
            return `Your membership has moved from ${m.plan} to ${m.toPlan ?? "a new plan"}${at}. It renews next on ${on(m)}.`;
    }
}

function membershipSubject(m: MembershipNoticeVars): string {
    switch (m.variant) {
        case "JOINED":
        case "STARTS_LATER":
            return `Welcome to ${m.plan} at ${m.business}`;
        case "PAUSED":
        case "PAUSED_OPEN":
            return `Your membership at ${m.business} is paused`;
        case "RESUMED":
            return `Your membership at ${m.business} has started again`;
        case "CANCELLED_NOW":
        case "CANCELS_AT_END":
            return `Your membership at ${m.business} is cancelled`;
        case "KEPT":
            return `Your membership at ${m.business} carries on`;
        case "PLAN_CHANGE_BOOKED":
            return `Your membership at ${m.business} is changing plan`;
        case "PLAN_CHANGE_CALLED_OFF":
            return `Your membership at ${m.business} stays on ${m.plan}`;
        case "PLAN_CHANGED":
            return `Your membership at ${m.business} has changed plan`;
    }
}

export const membershipNotice = defineNotice<MembershipNotice>({
    setting: "MEMBERSHIP",
    load: (tx, organizationId, payload) =>
        loadMembership(tx, organizationId, payload),
    sentence: ({ membership }) => membershipSentence(membership),
    subject: ({ membership }) => membershipSubject(membership),
    names: ({ membership }) => ({
        business: membership.business,
        firstName: membership.firstName,
    }),
});

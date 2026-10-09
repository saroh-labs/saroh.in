import type { Prisma } from "@saroh/database";

import { businessTimezone } from "../bookings/staff-availability";
import { paperDay, paperMoney } from "../invoices/invoice-paper-view";
import type { RenderedEmail } from "./billing-emails";
import { renewalReminderEmail } from "./billing-emails";
import type { TermCheckout } from "./billing-term";
import { isOneTime, termOf } from "./billing-term";
import type { SarohLineInput } from "./saroh-invoice-terms";
import {
    FIRST_MONTH_KEY,
    paiseToRupees,
    samePeriodWindow,
    taxSarohLines,
} from "./saroh-invoice-terms";

type Tx = Prisma.TransactionClient;

/**
 * The reminder before a plan renews (#804, the Terms' "We email you 3 days
 * before"): 3 days before each autopay charge of a business's Saroh plan,
 * its billing people are emailed the amount, GST included, and the date in
 * the business's zone, with a link to Plan and billing. The hourly billing
 * sweep finds them (`renewal-reminder-notice.ts`) and claims each one once
 * per subscription and period end as a `CustomerNotice`; the email re-reads
 * the same rule (`renewalReminderOf`), so one queued before a change of
 * plan says nothing.
 *
 * Only a charge that will happen at the price we'd name is told. Nothing
 * when:
 * - the plan is Free, or not billed through a provider;
 * - it is TRIALING: the end of a free trial or a nominal first month has
 *   its own email 3 days ahead (`TRIAL_ENDING`), which names the charge;
 * - it is PAST_DUE (a failed charge has its own email) or CANCELLED;
 * - it ends at the period's end (`cancelAtPeriodEnd`: a cancel, Free
 *   chosen, or a term run out) — the move-down notices tell that;
 * - a move is due by then (`pendingFrom`): the next charge may be another
 *   amount, or a new provider subscription's, and the move is told;
 * - another plan, or the next term, is authorised to start by then (a
 *   SCHEDULED checkout): that checkout named its own charge;
 * - the plan was paid once for the year (DEC-093): it never renews by
 *   itself; or the period end is the 12-month term's end (DEC-100) — no
 *   charge then, the term-ending notices ask for the next term instead.
 */

/** How many days before a renewal its reminder goes. */
export const RENEWAL_REMINDER_DAYS = 3;

/** The once-only claim on each reminder (`CustomerNotice.kind`). */
export const RENEWAL_REMINDER_NOTICE_KIND = "RENEWAL_REMINDER";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A period end this close to the term's end is the term's end, not a
 * charge: a monthly term's last charge is a whole month before it.
 */
const TERM_END_MARGIN_MS = 7 * DAY_MS;

/** Provider dates drift a little: a move or plan due a day after counts. */
const SAME_DAY_MS = DAY_MS;

/** One reminder per subscription and period end. */
export function renewalReminderEventKey(
    subscriptionId: string,
    renewsAt: Date,
): string {
    return `renewal-reminder:${subscriptionId}:${renewsAt.toISOString()}`;
}

/** What the pure rule needs to know about a subscription. */
export interface RenewalFacts {
    status: string;
    provider: string | null;
    providerSubscriptionId: string | null;
    currentPeriodEnd: Date | null;
    cancelAtPeriodEnd: boolean;
    pendingFrom: Date | null;
    planPricePaise: number;
    /** The checkout behind its provider subscription, when there is one. */
    checkout: TermCheckout | null;
    /** The business's SCHEDULED checkout, when it has one. */
    scheduled: { startAt: Date | null } | null;
}

export type RenewalDecision =
    { remind: true; renewsAt: Date } | { remind: false; reason: string };

/** Whether a reminder is due now, and why not. Pure. */
export function renewalDecision(f: RenewalFacts, now: Date): RenewalDecision {
    const no = (reason: string): RenewalDecision => ({ remind: false, reason });
    if (f.status !== "ACTIVE") return no("not_active");
    if (!f.provider || !f.providerSubscriptionId || f.planPricePaise <= 0) {
        return no("not_billed");
    }
    const renewsAt = f.currentPeriodEnd;
    if (!renewsAt) return no("not_due");
    const left = renewsAt.getTime() - now.getTime();
    if (left <= 0 || left > RENEWAL_REMINDER_DAYS * DAY_MS) {
        return no("not_due");
    }
    if (f.cancelAtPeriodEnd) return no("ends_then");
    const by = renewsAt.getTime() + SAME_DAY_MS;
    if (f.pendingFrom && f.pendingFrom.getTime() <= by) return no("move_due");
    if (f.scheduled && (f.scheduled.startAt?.getTime() ?? 0) <= by) {
        return no("plan_authorised");
    }
    if (f.checkout && isOneTime(f.checkout)) return no("paid_once");
    const term = termOf({ currentPeriodEnd: renewsAt }, f.checkout, now);
    if (
        term?.payment === "AUTOPAY" &&
        renewsAt.getTime() > term.endsAt.getTime() - TERM_END_MARGIN_MS
    ) {
        return no("term_ends");
    }
    return { remind: true, renewsAt };
}

/** What a charge comes to, GST included, as its invoice will add it up. */
export function renewalTotalPaise(input: {
    planPricePaise: number;
    /** A coupon's discount still owed on this charge (U16), else 0. */
    discountPaise: number;
    addons: readonly { quantity: number; unitPaise: number }[];
}): number {
    const lines: SarohLineInput[] = [
        {
            description: "plan",
            sac: null,
            unitPaise: input.planPricePaise,
            discountPaise: input.discountPaise,
        },
        ...input.addons.map((a) => ({
            description: "add-on",
            sac: null,
            quantity: a.quantity,
            unitPaise: a.unitPaise,
        })),
    ];
    // The tax is the same whichever way it splits (CGST + SGST or IGST).
    return taxSarohLines(lines, "INTER").totals.totalPaise;
}

/** A renewal to remind the business of, as read now. */
export interface RenewalReminder {
    subscriptionId: string;
    organizationId: string;
    planName: string;
    cycle: "month" | "year";
    renewsAt: Date;
    totalPaise: number;
    withAddons: boolean;
}

/**
 * The renewal a subscription should be reminded of now, or null. The sweep
 * and the email both read it.
 */
export async function renewalReminderOf(
    db: Tx,
    subscriptionId: string,
    now: Date,
): Promise<RenewalReminder | null> {
    const sub = await db.subscription.findUnique({
        where: { id: subscriptionId },
        select: {
            id: true,
            organizationId: true,
            status: true,
            provider: true,
            providerSubscriptionId: true,
            currentPeriodEnd: true,
            cancelAtPeriodEnd: true,
            pendingFrom: true,
            plan: { select: { name: true, interval: true, priceCents: true } },
        },
    });
    if (!sub?.provider || !sub.providerSubscriptionId) return null;
    const provider = sub.provider;
    const providerSubscriptionId = sub.providerSubscriptionId;
    const [checkout, scheduled] = await Promise.all([
        db.billingCheckout.findUnique({
            where: {
                provider_providerSubscriptionId: {
                    provider,
                    providerSubscriptionId,
                },
            },
            select: {
                providerPlanId: true,
                cycle: true,
                startAt: true,
                completedAt: true,
                createdAt: true,
                discountPaise: true,
                discountCharges: true,
            },
        }),
        db.billingCheckout.findFirst({
            where: { organizationId: sub.organizationId, status: "SCHEDULED" },
            select: { startAt: true },
        }),
    ]);
    const decision = renewalDecision(
        {
            ...sub,
            planPricePaise: sub.plan.priceCents,
            checkout,
            scheduled,
        },
        now,
    );
    if (!decision.remind) return null;
    const { renewsAt } = decision;
    const cycle = sub.plan.interval === "year" ? "year" : "month";

    // A coupon comes off the provider subscription's first charges, counted
    // as the renewal invoice counts them (`invoiceRenewalInTx`).
    let discountPaise = 0;
    if (checkout && checkout.discountCharges > 0) {
        const before = await db.sarohInvoice.count({
            where: {
                organizationId: sub.organizationId,
                provider,
                providerSubscriptionId,
                source: { not: "UPGRADE" },
                NOT: { chargeKey: { startsWith: FIRST_MONTH_KEY } },
            },
        });
        if (before < checkout.discountCharges) {
            discountPaise = checkout.discountPaise;
        }
    }
    // Add-ons owed on this charge (`addon-charges.ts`).
    const addons = await db.subscriptionAddonCharge.findMany({
        where: {
            organizationId: sub.organizationId,
            provider,
            providerSubscriptionId,
            status: { in: ["QUEUED", "SENT"] },
            chargeAt: samePeriodWindow(renewsAt, cycle),
        },
        select: { quantity: true, unitPaise: true },
    });
    return {
        subscriptionId: sub.id,
        organizationId: sub.organizationId,
        planName: sub.plan.name,
        cycle,
        renewsAt,
        totalPaise: renewalTotalPaise({
            planPricePaise: sub.plan.priceCents,
            discountPaise,
            addons,
        }),
        withAddons: addons.length > 0,
    };
}

/**
 * Subscriptions that may renew within the reminder's days, by id: active,
 * paid, billed through a provider and not ending (`renewalReminderOf`
 * decides the rest).
 */
export async function renewalReminderCandidates(
    db: Pick<Tx, "subscription">,
    now: Date,
): Promise<string[]> {
    const horizon = new Date(now.getTime() + RENEWAL_REMINDER_DAYS * DAY_MS);
    const rows = await db.subscription.findMany({
        where: {
            status: "ACTIVE",
            provider: { not: null },
            providerSubscriptionId: { not: null },
            cancelAtPeriodEnd: false,
            currentPeriodEnd: { gt: now, lte: horizon },
            plan: { priceCents: { gt: 0 } },
        },
        select: { id: true },
        orderBy: { id: "asc" },
    });
    return rows.map((r) => r.id);
}

/**
 * The `RENEWAL` billing email's words, re-read now: a string (why it says
 * nothing) once the renewal it was queued for no longer stands.
 */
export async function composeRenewalReminder(
    db: Tx,
    p: { organizationId: string; subscriptionId: string; renewsAt: string },
    now: Date,
    /** Plan and billing in the workspace. */
    url: string,
): Promise<RenderedEmail | string> {
    const r = await renewalReminderOf(db, p.subscriptionId, now);
    if (
        r?.organizationId !== p.organizationId ||
        r.renewsAt.toISOString() !== p.renewsAt
    ) {
        return "renewal_changed";
    }
    const [org, zone] = await Promise.all([
        db.organization.findUnique({
            where: { id: p.organizationId },
            select: { name: true },
        }),
        businessTimezone(db, p.organizationId),
    ]);
    return renewalReminderEmail({
        businessName: org?.name ?? "your business",
        planName: r.planName,
        renewsOn: paperDay(r.renewsAt.toISOString(), zone),
        total: paperMoney(paiseToRupees(r.totalPaise), "INR"),
        cycle: r.cycle,
        withAddons: r.withAddons,
        url,
    });
}

import { formatCount, formatMoney } from "@/lib/format/money";

/**
 * Settings → Plan and billing, as data: what Saroh charges this business
 * (S7-005, DEC-014). Not the business's own Billing (ADR-007, `/billing/…`),
 * which is what its customers owe it.
 *
 * Pure: shapes and the words the page says. The reads are in `./service.ts`.
 *
 * This is "Your plan" for a business the plans catalogue doesn't reach yet
 * (`GET …/billing/access` says `legacy`): read off its subscription alone.
 * On the catalogue, `./plan-view.ts` draws it. The usage line under the
 * plan is still a seam (`getPlanUsage`, {@link NotAvailableYet}).
 */

/** A plan in Saroh's catalogue, as `GET /billing/plans` returns it. */
export interface SarohPlan {
    id: string;
    /** "free" | "pro" | "business" … — the catalogue key. */
    key: string;
    version: number;
    name: string;
    /** Minor units (paise). */
    priceCents: number;
    currency: string;
    /** "month" | "year". */
    interval: string;
    /** The limit map the API enforces, e.g. `{ teamMembers: 5 }`. */
    entitlements: Record<string, unknown>;
    active: boolean;
}

export type SarohSubscriptionStatus =
    "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELLED";

/** This business's subscription, as `GET …/billing/subscription` returns it. */
export interface SarohSubscription {
    id: string;
    status: SarohSubscriptionStatus | (string & {});
    /** "RAZORPAY" | "CASHFREE", or null on a free plan. */
    provider: string | null;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    /** "month" | "year" (plans catalogue U16). */
    billingCycle?: string;
    plan: SarohPlan;
}

/**
 * What a seam returns until api.saroh.in can answer it. The page shows the
 * layout with honest words in place of the data, never invented figures.
 */
export interface NotAvailableYet {
    status: "not-available";
}

export const NOT_AVAILABLE_YET: NotAvailableYet = { status: "not-available" };

/** A price in words: "₹1,499 a month", or "Free". */
export function planPrice(
    plan: Pick<SarohPlan, "priceCents" | "currency" | "interval">,
): string {
    if (plan.priceCents <= 0) return "Free";
    const amount = formatMoney(plan.priceCents, plan.currency);
    return `${amount} a ${plan.interval === "year" ? "year" : "month"}`;
}

/**
 * What a plan includes, from the limits the API enforces — never from a
 * hand-written list that could promise more than the server allows.
 *
 * Sites are not counted: a business has one website on every plan
 * (ADR-006, DEC-094), so "up to 5 websites" would be untrue.
 */
export function planIncludes(entitlements: Record<string, unknown>): string {
    const parts: string[] = ["Website, bookings and selling"];
    const people = entitlements.teamMembers;
    if (typeof people === "number") {
        parts.push(people === 1 ? "just you" : `up to ${people} people`);
    } else if (people === undefined || people === null) {
        parts.push("as many people as you need");
    }
    if (entitlements.customDomain === true) parts.push("your own domain");
    return parts.join(" · ");
}

/** The right-hand side of "Your plan": the next charge, or why there is none. */
export type NextCharge =
    /** "4 Oct 2026 · ₹1,499". */
    | { kind: "charge"; iso: string; amount: string }
    /** "Ends 4 Oct 2026". */
    | { kind: "ends"; iso: string }
    | { kind: "text"; text: string };

export interface PlanSummary {
    /** "Business", or "Early access" with no subscription. */
    name: string;
    /** "₹1,499 a month" / "Free"; null when there is no plan to price. */
    price: string | null;
    includes: string;
    next: NextCharge;
    /** How it is paid: "Through Razorpay". Null when nothing is. */
    method: string | null;
    /** The line along the foot of the card. */
    footnote: string;
    /** A state that needs the owner's eye, said in words. */
    warning: string | null;
}

/** Last month, as the usage seam (`getPlanUsage`) will return it. */
export interface PlanUsage {
    receipts: number;
    invoices: number;
    paymentsCents: number;
    currency: string;
}

/** "Last month Saroh sent 214 receipts and 38 invoices for …". */
export function usageLine(usage: PlanUsage, businessName: string): string {
    const n = (count: number, one: string) =>
        `${formatCount(count)} ${one}${count === 1 ? "" : "s"}`;
    const took = formatMoney(usage.paymentsCents, usage.currency);
    return `Last month Saroh sent ${n(usage.receipts, "receipt")} and ${n(usage.invoices, "invoice")} for ${businessName}, and took ${took} in payments.`;
}

const PROVIDER_NAMES: Record<string, string> = {
    RAZORPAY: "Razorpay",
    CASHFREE: "Cashfree",
};

/**
 * "Your plan", from the subscription the API returned.
 *
 * No subscription is the state of almost every business today: Saroh has
 * not switched billing on, so it charges nothing. The card says that rather
 * than dressing it up as a named plan.
 */
export function planSummary(
    subscription: SarohSubscription | null,
    businessName: string,
    /** Null until the API has it (`getPlanUsage`). */
    usage: PlanUsage | null = null,
): PlanSummary {
    if (!subscription) {
        return {
            name: "Early access",
            price: null,
            includes: `Saroh hasn't switched billing on for ${businessName}, so it isn't charged for anything.`,
            next: { kind: "text", text: "Nothing to pay" },
            method: null,
            footnote: "Nothing is charged until you choose a plan.",
            warning: null,
        };
    }

    const { plan } = subscription;
    const free = plan.priceCents <= 0;
    const method = subscription.provider
        ? `Through ${PROVIDER_NAMES[subscription.provider] ?? subscription.provider}`
        : null;
    const base = {
        name: plan.name,
        price: planPrice(plan),
        includes: planIncludes(plan.entitlements),
        method,
        // The design's usage line waits on the API (`getPlanUsage`); until
        // then the foot says so, with no figures.
        footnote: usage
            ? usageLine(usage, businessName)
            : `A monthly summary of what Saroh did for ${businessName} isn't ready yet.`,
    };

    if (subscription.status === "CANCELLED") {
        return {
            ...base,
            next: { kind: "text", text: "Nothing — the plan has ended" },
            warning: `This plan has ended. ${businessName} is back to what Saroh gives every business.`,
        };
    }
    if (subscription.status === "PAST_DUE") {
        return {
            ...base,
            next: { kind: "text", text: "Payment overdue" },
            warning:
                "The last payment didn't go through. Nothing has been switched off.",
        };
    }
    if (subscription.cancelAtPeriodEnd) {
        return {
            ...base,
            next: subscription.currentPeriodEnd
                ? { kind: "ends", iso: subscription.currentPeriodEnd }
                : { kind: "text", text: "Ends at the end of this period" },
            warning: null,
        };
    }
    if (free) {
        return {
            ...base,
            next: { kind: "text", text: "Nothing to pay" },
            warning: null,
        };
    }
    return {
        ...base,
        next: subscription.currentPeriodEnd
            ? {
                  kind: "charge",
                  iso: subscription.currentPeriodEnd,
                  amount: formatMoney(plan.priceCents, plan.currency) ?? "",
              }
            : { kind: "text", text: "Date not set yet" },
        warning:
            subscription.status === "TRIALING"
                ? "On a trial — nothing has been charged yet."
                : null,
    };
}

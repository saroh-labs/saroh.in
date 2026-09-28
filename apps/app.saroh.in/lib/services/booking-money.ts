/**
 * A booking's money in words (E8, DEC-051): what was paid online at booking,
 * what is due at the visit, where a cancel's refund stands, and what a
 * cancel will do with the money. The API works every amount out; this only
 * says it. Pure and client-safe, so the detail screen, the cancel dialog and
 * their tests agree.
 */

import { formatMoney } from "@/lib/format/money";
import type { resolveActiveOrganization } from "@/lib/organizations/service";

/** A cancel's refund, as the provider has answered for it so far. */
export interface BookingRefund {
    amountCents: number;
    status: "PENDING" | "SUCCEEDED" | "FAILED";
    /** No answer from the provider yet: the money is held. */
    beingConfirmed: boolean;
}

/** What the booking read says about its money (`GET bookings/:id`). */
export interface BookingMoney {
    priceCents: number | null;
    currency: string | null;
    paidOnlineCents: number;
    /** Only the deposit was paid at booking. */
    deposit: boolean;
    /** Left to pay at the visit; null for a pack's class, or once cancelled. */
    dueCents: number | null;
    refund: BookingRefund | null;
}

/** What a cancel did with money paid online (`DELETE bookings/:id`). */
export interface CancelMoney {
    refund: {
        amountCents: number;
        currency: string;
        status: "SENT" | "CONFIRMING" | "REFUSED";
    } | null;
    kept: { amountCents: number; currency: string } | null;
}

type Org = Awaited<ReturnType<typeof resolveActiveOrganization>>;

/** `payment:manage`: may hand back money the rule keeps. */
export function canRefundPayments(organization: Org): boolean {
    return organization?.actions
        ? organization.actions.includes("payment:manage")
        : organization?.role === "OWNER" || organization?.role === "ADMIN";
}

const money = (cents: number, currency: string | null) =>
    formatMoney(cents, currency) ?? "";

/**
 * The line under When: "Deposit ₹400 paid · ₹400 due at the visit",
 * "₹800 paid online", or "₹800 due at the visit". Null when there is
 * nothing to say (no price, a pack's class).
 */
export function paidLine(m: BookingMoney): string | null {
    const due =
        m.dueCents !== null && m.dueCents > 0
            ? `${money(m.dueCents, m.currency)} due at the visit`
            : null;
    if (m.paidOnlineCents > 0) {
        const paid = m.deposit
            ? `Deposit ${money(m.paidOnlineCents, m.currency)} paid`
            : `${money(m.paidOnlineCents, m.currency)} paid online`;
        return due ? `${paid} · ${due}` : paid;
    }
    return due;
}

/** Where a cancel's refund stands, or null when there was none. */
export function refundLine(m: BookingMoney): string | null {
    const r = m.refund;
    if (!r) return null;
    const amount = money(r.amountCents, m.currency);
    if (r.status === "SUCCEEDED") return `${amount} refunded.`;
    if (r.status === "FAILED") {
        return `The refund of ${amount} didn't go through: the payment provider refused it. Refund it from the provider's dashboard.`;
    }
    return r.beingConfirmed
        ? `Refund of ${amount} is being confirmed with the payment provider.`
        : `Refund of ${amount} sent. The payment provider is confirming it.`;
}

/** "Sat 19 Sep, 10:00" — a deadline in the booking's own zone. */
export function deadlineText(iso: string, timeZone: string): string {
    return new Intl.DateTimeFormat("en-GB", {
        timeZone,
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    })
        .format(new Date(iso))
        .replace("Sept", "Sep");
}

/** What cancelling now will do with money paid online, before it is done. */
export interface CancelPlan {
    /** Past the free-cancel time fixed at booking. */
    late: boolean;
    /** "₹400". */
    amount: string;
    /** "deposit" or "payment". */
    what: "deposit" | "payment";
    body: string;
    /** Late, and the caller may refund it anyway. */
    canOverride: boolean;
}

/**
 * The cancel dialog's plan, or null when nothing was paid online (or it
 * has already gone back) and a cancel needs no word about money. The
 * deadline is the one fixed at booking (DEC-051); a booking with none is
 * never late.
 */
export function cancelPlan(input: {
    money: BookingMoney | undefined;
    freeCancelUntil: string | null | undefined;
    timezone: string;
    now: number;
    canRefund: boolean;
}): CancelPlan | null {
    const m = input.money;
    if (!m || m.paidOnlineCents <= 0 || m.refund) return null;
    const amount = money(m.paidOnlineCents, m.currency);
    const what = m.deposit ? "deposit" : "payment";
    const late =
        !!input.freeCancelUntil &&
        input.now > new Date(input.freeCancelUntil).getTime();
    if (!late) {
        return {
            late,
            amount,
            what,
            canOverride: false,
            body: `It's before the free-cancel time, so the ${amount} ${what} is refunded to them.`,
        };
    }
    const when = deadlineText(input.freeCancelUntil ?? "", input.timezone);
    return {
        late,
        amount,
        what,
        canOverride: input.canRefund,
        body: input.canRefund
            ? `It's past the free-cancel time (${when}), so the ${amount} ${what} is kept. You can refund it anyway.`
            : `It's past the free-cancel time (${when}), so the ${amount} ${what} is kept. Only someone who can refund payments can give it back.`,
    };
}

/** What the toast says once it is cancelled. */
export function cancelledMessage(m: CancelMoney | undefined): {
    tone: "success" | "error";
    title: string;
    body?: string;
} {
    const r = m?.refund;
    if (r) {
        const amount = money(r.amountCents, r.currency);
        if (r.status === "REFUSED") {
            return {
                tone: "error",
                title: "Booking cancelled, but the refund didn't go through.",
                body: `The payment provider refused to refund ${amount}. Refund it from the provider's dashboard.`,
            };
        }
        return {
            tone: "success",
            title:
                r.status === "SENT"
                    ? `Booking cancelled. ${amount} is being refunded.`
                    : `Booking cancelled. The ${amount} refund is being confirmed with the payment provider.`,
        };
    }
    if (m?.kept) {
        return {
            tone: "success",
            title: `Booking cancelled. The ${money(m.kept.amountCents, m.kept.currency)} paid is kept.`,
        };
    }
    return { tone: "success", title: "Booking cancelled" };
}

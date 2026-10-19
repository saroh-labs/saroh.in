import { formatDate, formatDateTime } from "@/lib/format/datetime";
import { formatMoneyMajor } from "@/lib/format/money";
import { count, plural } from "@/lib/format/plural";
import { payOf, setPriceWords } from "@/lib/gst/on-price";
import { initials } from "@/lib/names";
import { absentText } from "@saroh/ui/lib/absent";

import type {
    Interval,
    Plan,
    Renewals,
    Subscription,
    SubscriptionAutopay,
    SubscriptionCharge,
} from "./service";

/**
 * How the Subscriptions screens say a subscription (plan 2026-09-23-003,
 * U12/U13, after "Saroh Subscriptions" and "Saroh Subscription Detail").
 * Pure: every "now" is passed in, so a server page computes the words once
 * and the client only renders them.
 */

export type ListTab = "active" | "failed" | "paused" | "cancelled";
export type Tone = "ok" | "accent" | "bad" | "off";

const DAY = 86_400_000;

/** The list tab it sits on. A failed renewal wins over running or paused. */
export function listTab(
    sub: Pick<Subscription, "status" | "paymentFailed">,
): ListTab {
    if (sub.status === "CANCELLED") return "cancelled";
    if (sub.paymentFailed) return "failed";
    return sub.status === "PAUSED" ? "paused" : "active";
}

export const TAB_LABEL: Record<ListTab, string> = {
    active: "Active",
    failed: "Payment failed",
    paused: "Paused",
    cancelled: "Cancelled",
};

export const TAB_TONE: Record<ListTab, Tone> = {
    active: "ok",
    failed: "bad",
    paused: "accent",
    cancelled: "off",
};

/**
 * The list's views, which its one dropdown switches between: each status,
 * and everything. "Need you" is the payment failed set (`listTab`), under
 * the words the header says it in.
 */
export type ListView = ListTab | "all";

export const VIEW_LABEL: Record<ListView, string> = {
    failed: "Need you",
    active: "Active",
    paused: "Paused",
    cancelled: "Cancelled",
    all: "All subscriptions",
};

/**
 * `?view=` (and `?tab=`, which older links and Home's still carry;
 * "overdue" was the old name): the view someone chose, or null when the
 * address chooses none and the list opens on its default.
 */
export function viewFromQuery(value: string | undefined): ListView | null {
    if (value === "overdue") return "failed";
    return value === "failed" ||
        value === "active" ||
        value === "paused" ||
        value === "cancelled" ||
        value === "all"
        ? value
        : null;
}

type Standing = Pick<Subscription, "status" | "paymentFailed">;

/**
 * Where the list opens when nobody chose: on who needs the owner, when
 * anyone does, else on the active ones.
 */
export function defaultView(subs: readonly Standing[]): ListView {
    return subs.some((s) => listTab(s) === "failed") ? "failed" : "active";
}

/**
 * The views in the dropdown's order, the default first: the shared list
 * opens on its first view, and "Clear filters" goes back to it.
 */
export function listViews(subs: readonly Standing[]): ListView[] {
    return defaultView(subs) === "failed"
        ? ["failed", "active", "paused", "cancelled", "all"]
        : ["active", "failed", "paused", "cancelled", "all"];
}

/** Whether a subscription is in a view. */
export function inView(sub: Standing, view: ListView): boolean {
    return view === "all" || listTab(sub) === view;
}

/** The screen's two tabs: who is subscribed, and the plans on sale (D3). */
export type ScreenTab = "subscribers" | "plans";

/** `?tab=plans` opens Plans; anything else is the subscribers. */
export function screenTabFromQuery(value: string | undefined): ScreenTab {
    return value === "plans" ? "plans" : "subscribers";
}

const PER: Record<Interval, { short: string; long: string }> = {
    WEEK: { short: "wk", long: "week" },
    MONTH: { short: "mo", long: "month" },
    QUARTER: { short: "qtr", long: "quarter" },
    YEAR: { short: "yr", long: "year" },
};

/**
 * An amount that recurs, in the one form every screen says it in: "₹1,200
 * a month", "₹12,000 a year". `narrow` is the short form, "₹1,200/mo", for
 * a column that is narrow on a phone and nowhere else.
 */
export function recurringPrice(
    price: string,
    currency: string,
    interval: Interval,
    narrow = false,
): string {
    const money = formatMoneyMajor(price, currency);
    return narrow
        ? `${money}/${PER[interval].short}`
        : `${money} a ${PER[interval].long}`;
}

/**
 * What one period comes to for someone, GST and all: the API's `pay`, the
 * amount their next invoice is written for. Every figure that is money
 * expected or charged reads this, never `price` (the price the business
 * set, before GST where GST is added). An API before `pay` has only the
 * price, which was the amount then.
 */
export function subscriptionPay(sub: { price: string; pay?: string }): string {
    return sub.pay ?? sub.price;
}

/**
 * About what the running subscriptions bring in a month, GST and all, in
 * the currency most of them are in. An estimate by design ("about"): a
 * yearly plan counts a twelfth, a weekly one 52 twelfths.
 */
export function monthlyTotal(
    subs: readonly Pick<
        Subscription,
        "status" | "paymentFailed" | "price" | "pay" | "currency" | "interval"
    >[],
): { amount: number; currency: string } | null {
    const running = subs.filter((s) => listTab(s) === "active");
    if (!running.length) return null;
    const counts: Record<string, number> = {};
    for (const s of running) counts[s.currency] = (counts[s.currency] ?? 0) + 1;
    const currency = Object.keys(counts).sort(
        (a, b) => counts[b] - counts[a],
    )[0];
    const factor: Record<Interval, number> = {
        WEEK: 52 / 12,
        MONTH: 1,
        QUARTER: 1 / 3,
        YEAR: 1 / 12,
    };
    const amount = running
        .filter((s) => s.currency === currency)
        .reduce(
            (n, s) => n + Number(subscriptionPay(s)) * factor[s.interval],
            0,
        );
    return { amount: Math.round(amount), currency };
}

/**
 * Who needs the owner, and what they owe: how many renewals aren't paid,
 * and the sum of the invoices unpaid on those subscriptions as the API
 * counted them (`unpaidTotal`), in the currency most of them are in. No
 * amount where the read gives none (a role that can't read invoices).
 */
export function needYou(
    subs: readonly Pick<
        Subscription,
        "status" | "paymentFailed" | "unpaidTotal" | "currency"
    >[],
): { count: number; unpaid: { amount: number; currency: string } | null } {
    const failed = subs.filter((s) => listTab(s) === "failed");
    if (!failed.length) return { count: 0, unpaid: null };
    const counts: Record<string, number> = {};
    for (const s of failed) counts[s.currency] = (counts[s.currency] ?? 0) + 1;
    const currency = Object.keys(counts).sort(
        (a, b) => counts[b] - counts[a],
    )[0];
    // Whole paise, so a sum of amounts never drifts as a float.
    const cents = failed
        .filter((s) => s.currency === currency)
        .reduce((n, s) => n + Math.round(Number(s.unpaidTotal) * 100), 0);
    return {
        count: failed.length,
        unpaid: cents > 0 ? { amount: cents / 100, currency } : null,
    };
}

/**
 * The header's summary: what needs the owner first ("8 need you · ₹6,600
 * unpaid"), then the quieter count ("12 active · about ₹14,000 a month").
 * `lead` is null when nobody needs them.
 */
export function listSummary(
    subs: readonly Pick<
        Subscription,
        | "status"
        | "paymentFailed"
        | "unpaidTotal"
        | "price"
        | "pay"
        | "currency"
        | "interval"
    >[],
): { lead: string | null; rest: string } {
    const need = needYou(subs);
    const active = subs.filter((s) => listTab(s) === "active").length;
    const total = monthlyTotal(subs);
    return {
        lead: need.count
            ? [
                  `${need.count} ${plural(need.count, "needs", "need")} you`,
                  need.unpaid
                      ? `${formatMoneyMajor(need.unpaid.amount, need.unpaid.currency)} unpaid`
                      : "",
              ]
                  .filter(Boolean)
                  .join(" · ")
            : null,
        rest: [
            `${active} active`,
            total
                ? `about ${formatMoneyMajor(total.amount, total.currency)} a month`
                : "",
        ]
            .filter(Boolean)
            .join(" · "),
    };
}

function daysLate(dueAt: string, now: Date): number {
    return Math.floor((now.getTime() - Date.parse(dueAt)) / DAY);
}

/**
 * Why a failed renewal is failed, in words: it is not paid, and how late —
 * or, before its due date, that autopay didn't collect it (D13).
 */
export function failWhy(
    sub: Pick<Subscription, "failedCharge" | "currency" | "price">,
    now: Date,
): string {
    const charge = sub.failedCharge;
    if (!charge) return "The latest renewal isn't paid and is past due";
    const amount = formatMoneyMajor(charge.total, sub.currency);
    if (charge.dueAt && Date.parse(charge.dueAt) > now.getTime()) {
        return `Renewal of ${amount} wasn't collected by autopay`;
    }
    const late = charge.dueAt ? daysLate(charge.dueAt, now) : 0;
    return late > 0
        ? `Renewal of ${amount} isn't paid, ${count(late, "day")} past due`
        : `Renewal of ${amount} isn't paid, past due`;
}

/**
 * "Autopay charge in progress · 14 Oct" while a charge is under way (D13),
 * the day being when the debit is asked for; null when none is.
 */
export function chargingText(
    sub: Pick<Subscription, "autopayCharge" | "timezone">,
    now: Date,
): string | null {
    const at = sub.autopayCharge?.at;
    return at
        ? `Autopay charge in progress · ${formatDate(at, sub.timezone, { now })}`
        : null;
}

/**
 * The Retry a failed renewal offers (D13, default 35): "Charge autopay
 * again" when their mandate can take it, else "Retry with a new payment link"
 * for someone who may make one. None while a charge is under way.
 */
export function retryOffer(
    sub: Pick<Subscription, "autopayCharge" | "retryVia" | "failedCharge">,
    canPayLink: boolean,
): { label: string; via: "MANDATE" | "PAY_LINK" } | null {
    if (sub.autopayCharge) return null;
    if (sub.retryVia === "MANDATE") {
        return { label: "Charge autopay again", via: "MANDATE" };
    }
    // Absent: an API older than D13, where Retry is a payment link.
    if (sub.retryVia === null || !sub.failedCharge || !canPayLink) return null;
    return { label: "Try again with a new payment link", via: "PAY_LINK" };
}

/**
 * A paused one, in a few words: "Paused until 17 Oct" when it resumes on
 * its own (D8), "Pause ended 17 Oct" once that day has come and it is
 * still paused, else "Paused since 5 Sep".
 */
export function pausedText(
    sub: Pick<Subscription, "pausedAt" | "pausedUntil" | "timezone">,
    now: Date,
): string {
    if (sub.pausedUntil) {
        const day = formatDate(sub.pausedUntil, sub.timezone, { now });
        return pauseHasEnded(sub, now)
            ? `Pause ended ${day}`
            : `Paused until ${day}`;
    }
    return sub.pausedAt
        ? `Paused since ${formatDate(sub.pausedAt, sub.timezone, { now })}`
        : "Paused";
}

/** Paused with an end date that has come: the job hasn't resumed it yet. */
function pauseHasEnded(
    sub: Pick<Subscription, "pausedUntil">,
    now: Date,
): boolean {
    return (
        sub.pausedUntil !== null &&
        new Date(sub.pausedUntil).getTime() <= now.getTime()
    );
}

/**
 * The detail's sentence about a pause. Once its end date has come and it
 * is still paused, it says why (review S-2): one that ended inside its
 * paid period only waits for the hourly check; one that outlasted it
 * restarts with a new invoice at the next hourly check, which needs
 * Payments on — the job leaves it paused while Payments is off. The detail
 * doesn't know which, so the line is true either way (re-review 6).
 */
function pausedLine(
    sub: Pick<
        Subscription,
        "pausedAt" | "pausedUntil" | "timezone" | "currentPeriodEnd"
    >,
    now: Date,
): string {
    if (!sub.pausedUntil) return `${pausedText(sub, now)}.`;
    const day = formatDate(sub.pausedUntil, sub.timezone, { now });
    if (!pauseHasEnded(sub, now)) {
        return `Paused until ${day} · resumes on its own.`;
    }
    const extendsPeriod =
        new Date(sub.pausedUntil).getTime() <=
        new Date(sub.currentPeriodEnd).getTime();
    return extendsPeriod
        ? `Pause ended ${day} · resumes at the next hourly check.`
        : `Pause ended ${day} · restarts with a new invoice at the next hourly check, or once Payments is on if it's off.`;
}

/** A row's line under the status: when it next charges, or why it stopped. */
export function rowWhen(
    sub: Subscription,
    now: Date,
): { text: string; danger: boolean } {
    const tz = sub.timezone;
    const tab = listTab(sub);
    if (tab === "failed") return { text: failWhy(sub, now), danger: true };
    if (tab === "cancelled") {
        return {
            text: sub.cancelledAt
                ? `Ended ${formatDate(sub.cancelledAt, tz, { now })}`
                : "Ended",
            danger: false,
        };
    }
    if (tab === "paused") {
        return { text: pausedText(sub, now), danger: false };
    }
    if (sub.startsAt) {
        return {
            text: `Starts ${formatDate(sub.startsAt, tz, { now })}`,
            danger: false,
        };
    }
    if (sub.endsAt) {
        return {
            text: `Ends ${formatDate(sub.endsAt, tz, { now })}`,
            danger: false,
        };
    }
    if (sub.overdue && sub.overdueCount > 0) {
        const n = sub.overdueCount;
        return {
            text: `${n} older ${plural(n, "invoice")} overdue · ${formatMoneyMajor(sub.unpaidTotal, sub.currency)}`,
            danger: true,
        };
    }
    const badge = autopayBadgeText(sub.autopayOn);
    return {
        text: sub.nextRenewalAt
            ? [`Next ${formatDate(sub.nextRenewalAt, tz, { now })}`, badge]
                  .filter(Boolean)
                  .join(" · ")
            : absentText(),
        danger: false,
    };
}

const BADGE_METHOD: Record<string, string> = {
    UPI: "UPI Autopay",
    CARD: "Card autopay",
    EMANDATE: "Bank autopay",
};

/**
 * The list's autopay mark (D14, after "Saroh Subscriptions": "Next 2 Oct ·
 * UPI Autopay · priya.raman@okhdfc"): "UPI Autopay · mo•••@okicici",
 * "Autopay paused". Null: no autopay on.
 */
export function autopayBadgeText(
    badge: Subscription["autopayOn"],
): string | null {
    if (!badge) return null;
    if (badge.paused) return "Autopay paused";
    const head = (badge.method && BADGE_METHOD[badge.method]) ?? "Autopay";
    return badge.hint ? `${head} · ${badge.hint}` : head;
}

/**
 * A person's initials, for the round avatar: "Nisha Kulkarni" → "NK". The
 * one rule (`lib/names.ts`), past any title.
 */
export { initials };

// — Plans (D1) —————————————————————————————————————————————————

/** "8 classes a month", or "Unlimited classes" when the plan has no cap. */
export function classesText(classesPerMonth: number | null): string {
    if (!classesPerMonth) return "Unlimited classes";
    return `${count(classesPerMonth, "class", "classes")} a month`;
}

function people(n: number): string {
    return count(n, "person", "people");
}

/**
 * Who pays what, as Plan Detail says it: "12 people · current price" and
 * "₹1,500 a month", then each older price the API lists. The amount is
 * what each pays a period, GST and all (₹2,360 for a ₹2,000 price with
 * 18% added), since it is money coming in.
 */
export function payRows(
    plan: Pick<Plan, "byPrice">,
): { label: string; amount: string; older: boolean }[] {
    return plan.byPrice.map((b) => ({
        label: `${people(b.count)} · ${b.current ? "current price" : "older price"}`,
        amount: recurringPrice(subscriptionPay(b), b.currency, b.interval),
        older: !b.current,
    }));
}

/**
 * A plan card's notes: "3 still on ₹1,200, and they keep it". The price is
 * the one the business set, so it says "+ GST" where GST is added to it.
 */
export function olderPriceNotes(plan: Pick<Plan, "byPrice" | "gst">): string[] {
    return plan.byPrice
        .filter((b) => !b.current)
        .map(
            (b) =>
                `${b.count} still on ${setPriceWords(formatMoneyMajor(b.price, b.currency), plan.gst)}, and they keep it`,
        );
}

/**
 * Whether they keep an older price: the plan sells for something else now.
 * Only said when the currencies agree — two currencies are two prices, not
 * an older one.
 */
export function olderPrice(
    sub: Pick<Subscription, "price" | "currency" | "plan">,
    plans: readonly Pick<Plan, "id" | "price" | "currency" | "gst">[],
): { listPrice: string; listPay: string } | null {
    const plan = plans.find((p) => p.id === sub.plan.id);
    if (plan?.currency !== sub.currency) return null;
    // Two prices the business set, compared as typed.
    return Number(plan.price) !== Number(sub.price)
        ? {
              listPrice: plan.price,
              // What a new sign-up pays a period, GST and all.
              listPay: payOf(plan.price, plan.gst),
          }
        : null;
}

/**
 * "Keeps ₹2,360. The plan is ₹2,950 for new sign-ups": what they pay
 * beside what a new sign-up pays, both GST and all, so the two compare.
 */
export function keepsLine(
    sub: Pick<Subscription, "price" | "pay" | "currency">,
    older: { listPay: string },
): string {
    return `Keeps ${formatMoneyMajor(subscriptionPay(sub), sub.currency)}. The plan is ${formatMoneyMajor(older.listPay, sub.currency)} for new sign-ups`;
}

/**
 * The detail page's header: the status pill, the next charge large, when,
 * and the sentence beside the actions. `how` is how the latest charge was
 * paid, when known.
 */
export function headline(
    sub: Subscription,
    how: string | null,
    now: Date,
): {
    pill: { tone: Tone; label: string };
    big: string;
    when: string;
    line: string;
} {
    const tz = sub.timezone;
    const tab = listTab(sub);
    const d = (at: string) => formatDate(at, tz, { now });
    const ending = tab === "active" && sub.endsAt ? sub.endsAt : null;
    const pill = ending
        ? { tone: "accent" as const, label: `Ends ${d(ending)}` }
        : { tone: TAB_TONE[tab], label: TAB_LABEL[tab] };
    // The next charge is money expected: what it comes to, GST and all.
    const next = sub.pendingPlan ?? sub;
    const nextPay = formatMoneyMajor(subscriptionPay(next), next.currency);
    const charging = chargingText(sub, now);
    if (tab === "failed") {
        const due = sub.failedCharge?.dueAt;
        return {
            pill,
            big: formatMoneyMajor(
                sub.failedCharge?.total ?? subscriptionPay(sub),
                sub.currency,
            ),
            when: due ? `failed ${d(due)}` : "failed",
            line: charging
                ? `${charging}. Nothing else can be charged until the bank answers.`
                : `${failWhy(sub, now)}. Nothing is collected until it's paid.`,
        };
    }
    if (tab === "paused") {
        return {
            pill,
            big: absentText(),
            when: "",
            line: `${pausedLine(sub, now)} Nothing is charged while paused.`,
        };
    }
    if (tab === "cancelled") {
        return {
            pill,
            big: absentText(),
            when: "",
            line: `Cancelled. Ended ${sub.cancelledAt ? d(sub.cancelledAt) : "at the end of its period"}. Nothing more is charged.`,
        };
    }
    if (ending) {
        return {
            pill,
            big: absentText(),
            when: "",
            line: `Ends ${d(ending)}. No more charges. What's paid for still happens.`,
        };
    }
    if (sub.startsAt) {
        return {
            pill,
            big: formatMoneyMajor(subscriptionPay(sub), sub.currency),
            when: `starts ${d(sub.startsAt)}`,
            line: `Starts ${d(sub.startsAt)}. Nothing is charged before then.`,
        };
    }
    if (!sub.nextRenewalAt) {
        return {
            pill,
            big: absentText(),
            when: "",
            line: "Nothing is due to renew.",
        };
    }
    const on = d(sub.nextRenewalAt);
    return {
        pill,
        big: nextPay,
        when: on,
        line: charging
            ? `${charging} for this period. Next: ${nextPay} on ${on}`
            : `${nextPay} on ${on} · ${how ? `pays by ${how}` : "invoiced with a payment link"}`,
    };
}

// — Collections ————————————————————————————————————————————————

export interface CollectionRow {
    date: string;
    label: string;
    state: "Collect" | "Skipped" | "Paused" | "On hold";
    tone: Tone;
    skipped: boolean;
    /** Skip / Undo skip offered: running, still to come. */
    canSkip: boolean;
}

export function collectionRows(sub: Subscription, now: Date): CollectionRow[] {
    const tab = listTab(sub);
    return (sub.collection?.upcoming ?? []).map((c) => {
        const state =
            tab === "failed"
                ? "On hold"
                : tab === "paused"
                  ? "Paused"
                  : c.skipped
                    ? "Skipped"
                    : "Collect";
        return {
            date: c.date,
            label: formatDate(c.date, sub.timezone, { now, weekday: "short" }),
            state,
            tone:
                state === "On hold"
                    ? "bad"
                    : state === "Paused"
                      ? "off"
                      : state === "Skipped"
                        ? "accent"
                        : "ok",
            skipped: c.skipped,
            canSkip: tab === "active" && c.changeable,
        };
    });
}

// — Charges ————————————————————————————————————————————————————

export interface ChargeRow {
    id: string;
    date: string;
    result: string;
    tone: Tone;
    note: string;
    amount: string;
    number: string | null;
}

const METHOD: Record<string, string> = {
    CASH: "cash",
    UPI: "UPI",
    BANK_TRANSFER: "bank transfer",
    CARD: "card",
    ONLINE: "the payment link",
    OTHER: "another way",
};

/** Newest first: the order the charges card and the quick look read in. */
export function sortCharges(
    charges: readonly SubscriptionCharge[],
): SubscriptionCharge[] {
    return [...charges]
        .filter((c) => c.status !== "DRAFT")
        .sort((a, b) =>
            (b.issuedAt ?? b.createdAt).localeCompare(
                a.issuedAt ?? a.createdAt,
            ),
        );
}

/** A charge's invoice, where every charge row opens (UX-080). */
export function chargeHref(invoiceId: string): string {
    return `/billing/invoices/${encodeURIComponent(invoiceId)}`;
}

export function chargeRow(
    c: SubscriptionCharge,
    timeZone: string,
    now: Date,
): ChargeRow {
    const [result, tone]: [string, Tone] =
        c.kind === "CREDIT_NOTE"
            ? ["Credit", "off"]
            : c.standing === "PAID"
              ? ["Paid", "ok"]
              : c.standing === "OVERDUE"
                ? ["Failed", "bad"]
                : c.standing === "ISSUED"
                  ? ["Due", "accent"]
                  : c.standing === "CREDITED"
                    ? ["Credited", "off"]
                    : ["Void", "off"];
    const period =
        c.periodStart && c.periodEnd
            ? `${formatDate(c.periodStart, timeZone, { now })} to ${formatDate(
                  // The period's end is the next one's start: say the last day.
                  new Date(Date.parse(c.periodEnd) - 1).toISOString(),
                  timeZone,
                  { now },
              )}`
            : "";
    const how =
        c.standing === "PAID" && c.payment
            ? `paid by ${METHOD[c.payment.method] ?? "hand"}`
            : c.standing === "OVERDUE" && c.dueAt
              ? `due ${formatDate(c.dueAt, timeZone, { now })}`
              : "";
    return {
        id: c.id,
        date: formatDate(c.issuedAt ?? c.createdAt, timeZone, { now }),
        result,
        tone,
        note: [period, how].filter(Boolean).join(" · "),
        amount: formatMoneyMajor(c.total, c.currency),
        number: c.number,
    };
}

const AUTOPAY_METHOD: Record<string, string> = {
    UPI: "UPI",
    CARD: "card",
    EMANDATE: "bank account",
};

const AUTOPAY_FAILED: Record<string, string> = {
    NOT_APPROVED: "they didn't approve it",
    EXPIRED: "they didn't approve it in time",
    PROVIDER_REFUSED: "the payment provider didn't accept it",
    NO_ANSWER: "the payment provider didn't answer",
};

/**
 * The autopay line on Subscription Detail (D12), so the merchant can check
 * what the customer set up: "Autopay on · UPI · mo•••@okicici · limit
 * ₹1,500", "Autopay pending · UPI — waiting for them to approve it",
 * "Autopay failed · card — they didn't approve it". Null: no autopay.
 *
 * A set-up that took the ₹1 check (D12B, DEC-064) says where its refund
 * is — "· ₹1 check refunded", "· ₹1 check being refunded" — so the merchant
 * never reads it as money in.
 */
export function autopayLine(
    autopay: SubscriptionAutopay | null | undefined,
): string | null {
    if (!autopay) return null;
    const line = autopayStateText(autopay);
    const check = autopay.check ? autopayCheckText(autopay.check) : null;
    return check ? `${line} · ${check}` : line;
}

const CHECK_STATE: Record<
    NonNullable<SubscriptionAutopay["check"]>["state"],
    string
> = {
    REFUNDED: "refunded",
    REFUNDING: "being refunded",
    NOT_REFUNDED: "not refunded, so refund it from your payment provider",
};

function autopayCheckText(
    check: NonNullable<SubscriptionAutopay["check"]>,
): string {
    return `${formatMoneyMajor(check.amount, check.currency)} check ${CHECK_STATE[check.state]}`;
}

function autopayStateText(autopay: SubscriptionAutopay): string {
    const method = autopay.method ? AUTOPAY_METHOD[autopay.method] : null;
    const how = [method, autopay.hint].filter(Boolean).join(" · ");
    const withHow = (head: string) => (how ? `${head} · ${how}` : head);
    switch (autopay.state) {
        case "ON": {
            const limit = autopay.limit
                ? ` · limit ${formatMoneyMajor(autopay.limit, autopay.currency)}`
                : "";
            return `${withHow("Autopay on")}${limit}`;
        }
        case "PAUSED":
            return `${withHow("Autopay paused")}, paused in their UPI app`;
        case "PENDING":
            return `${withHow("Autopay pending")}, waiting for them to approve it`;
        case "FAILED":
            return `${withHow("Autopay failed")}: ${
                AUTOPAY_FAILED[autopay.failure ?? ""] ??
                AUTOPAY_FAILED.NOT_APPROVED
            }`;
    }
}

/** "UPI", "the payment link" — how the latest paid charge was paid, if any was. */
export function paysBy(charges: readonly SubscriptionCharge[]): string | null {
    const paid = sortCharges(charges).find(
        (c) => c.standing === "PAID" && c.payment,
    );
    return paid?.payment ? (METHOD[paid.payment.method] ?? null) : null;
}

/**
 * The GST sentence under the charges: said only from what its invoices
 * show, since a role that reads subscriptions may not read tax settings.
 */
export function gstNote(
    charges: readonly SubscriptionCharge[],
    where: "detail" | "list" = "detail",
    /**
     * True where the page knows the business is GST-registered. Its
     * invoices can still show no GST (a plan with no rate yet, or invoices
     * from before it registered), and "Not GST-registered" would then be
     * untrue: nothing is said, and the missing-rates notice says the rest.
     */
    registered: boolean | null = null,
): string {
    const issued = charges.filter((c) => c.status !== "DRAFT");
    if (!issued.length) return "";
    if (issued.some((c) => c.gst)) return "Each renewal makes a GST invoice.";
    if (registered === true) return "";
    return where === "list"
        ? "Not GST-registered. Renewals make receipts."
        : "Not GST-registered. Receipts, not tax invoices.";
}

// — Changes ————————————————————————————————————————————————————

// — Renewals ———————————————————————————————————————————————————

/**
 * "Renewals last ran Today, 06:00." — silence would read the same as a
 * stopped job. `late` when the next run is more than five minutes overdue,
 * or none has run.
 */
export function ranLine(
    r: Renewals,
    timeZone: string,
    now: Date,
): { text: string; late: boolean } {
    if (!r.lastCheckedAt) {
        return {
            text: "Renewals haven't run yet. Invoices go out when they do.",
            late: true,
        };
    }
    const dueBy = Date.parse(r.nextCheckAt ?? r.lastCheckedAt);
    const late = dueBy + 5 * 60_000 < now.getTime();
    const when = formatDateTime(r.lastCheckedAt, timeZone, {
        now,
        relative: true,
    });
    return {
        text: late
            ? `Renewals last ran ${when}, later than it should have. Renewals wait until it runs again.`
            : `Renewals last ran ${when}.`,
        late,
    };
}

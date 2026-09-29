import { DISPLAY_LOCALE } from "@/lib/format/locale";
import { formatMoneyMajor } from "@/lib/format/money";

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

/** `?tab=` (the design) or `?view=` (older links; "overdue" was the old name). */
export function tabFromQuery(value: string | undefined): ListTab {
    if (value === "overdue") return "failed";
    return value === "failed" || value === "paused" || value === "cancelled"
        ? value
        : "active";
}

/** The screen's tabs: the four lists, then Plans (D3). */
export type ScreenTab = ListTab | "plans";

/** `?tab=plans` opens Plans; anything else is a list tab. */
export function screenTabFromQuery(value: string | undefined): ScreenTab {
    return value === "plans" ? "plans" : tabFromQuery(value);
}

export function money(amount: string | number, currency: string): string {
    return formatMoneyMajor(amount, currency) ?? String(amount);
}

const PER: Record<Interval, { short: string; long: string }> = {
    WEEK: { short: "wk", long: "week" },
    MONTH: { short: "mo", long: "month" },
    QUARTER: { short: "qtr", long: "quarter" },
    YEAR: { short: "yr", long: "year" },
};

/** "₹1,200/mo" — a row's price. */
export function shortPrice(
    price: string,
    currency: string,
    interval: Interval,
): string {
    return `${money(price, currency)}/${PER[interval].short}`;
}

/** "₹1,200 / month" — the price in a sentence or a card. */
export function longPrice(
    price: string,
    currency: string,
    interval: Interval,
): string {
    return `${money(price, currency)} / ${PER[interval].long}`;
}

/**
 * About what the running subscriptions bring in a month, in the currency
 * most of them are in. An estimate by design ("about"): a yearly plan counts
 * a twelfth, a weekly one 52 twelfths.
 */
export function monthlyTotal(
    subs: readonly Pick<
        Subscription,
        "status" | "paymentFailed" | "price" | "currency" | "interval"
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
        .reduce((n, s) => n + Number(s.price) * factor[s.interval], 0);
    return { amount: Math.round(amount), currency };
}

/**
 * "20 Sep", "Sat 20 Sep", with the year when it is not this one. `at` is an
 * instant (read in `timeZone`) or a local date, YYYY-MM-DD.
 */
export function dayText(
    at: string,
    timeZone: string,
    now: Date,
    withWeekday = false,
): string {
    const local = /^\d{4}-\d{2}-\d{2}$/.test(at);
    const date = new Date(local ? `${at}T00:00:00Z` : at);
    const zone = local ? "UTC" : timeZone;
    const year = (d: Date, z: string) =>
        new Intl.DateTimeFormat("en-GB", {
            timeZone: z,
            year: "numeric",
        }).format(d);
    const sameYear = year(date, zone) === year(now, timeZone);
    const parts = new Intl.DateTimeFormat(DISPLAY_LOCALE, {
        timeZone: zone,
        day: "numeric",
        month: "short",
        ...(sameYear ? {} : { year: "numeric" }),
    })
        .format(date)
        // ICU's en-GB says "Sept"; the design, like every other month, three letters.
        .replace("Sept", "Sep");
    if (!withWeekday) return parts;
    const weekday = new Intl.DateTimeFormat(DISPLAY_LOCALE, {
        timeZone: zone,
        weekday: "short",
    }).format(date);
    return `${weekday} ${parts}`;
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
    const amount = money(charge.total, sub.currency);
    if (charge.dueAt && Date.parse(charge.dueAt) > now.getTime()) {
        return `Renewal of ${amount} wasn't collected by autopay`;
    }
    const late = charge.dueAt ? daysLate(charge.dueAt, now) : 0;
    return late > 0
        ? `Renewal of ${amount} isn't paid — ${late} ${late === 1 ? "day" : "days"} past due`
        : `Renewal of ${amount} isn't paid — past due`;
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
        ? `Autopay charge in progress · ${dayText(at, sub.timezone, now)}`
        : null;
}

/**
 * The Retry a failed renewal offers (D13, default 35): "Charge autopay
 * again" when their mandate can take it, else "Retry with a new pay link"
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
    // Absent: an API older than D13, where Retry is a pay link.
    if (sub.retryVia === null || !sub.failedCharge || !canPayLink) return null;
    return { label: "Retry with a new pay link", via: "PAY_LINK" };
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
        const day = dayText(sub.pausedUntil, sub.timezone, now);
        return pauseHasEnded(sub, now)
            ? `Pause ended ${day}`
            : `Paused until ${day}`;
    }
    return sub.pausedAt
        ? `Paused since ${dayText(sub.pausedAt, sub.timezone, now)}`
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
    const day = dayText(sub.pausedUntil, sub.timezone, now);
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
                ? `Ended ${dayText(sub.cancelledAt, tz, now)}`
                : "Ended",
            danger: false,
        };
    }
    if (tab === "paused") {
        return { text: pausedText(sub, now), danger: false };
    }
    if (sub.startsAt) {
        return {
            text: `Starts ${dayText(sub.startsAt, tz, now)}`,
            danger: false,
        };
    }
    if (sub.endsAt) {
        return { text: `Ends ${dayText(sub.endsAt, tz, now)}`, danger: false };
    }
    if (sub.overdue && sub.overdueCount > 0) {
        const n = sub.overdueCount;
        return {
            text: `${n} older ${n === 1 ? "invoice" : "invoices"} overdue · ${money(sub.unpaidTotal, sub.currency)}`,
            danger: true,
        };
    }
    return {
        text: sub.nextRenewalAt
            ? `Next ${dayText(sub.nextRenewalAt, tz, now)}`
            : "—",
        danger: false,
    };
}

/** A person's initials, for the round avatar: "Nisha Kulkarni" → "NK". */
export function initials(name: string): string {
    return name
        .split(/\s+/)
        .filter(Boolean)
        .map((w) => w[0].toUpperCase())
        .join("")
        .slice(0, 2);
}

// — Plans (D1) —————————————————————————————————————————————————

/** "8 classes a month", or "Unlimited classes" when the plan has no cap. */
export function classesText(classesPerMonth: number | null): string {
    if (!classesPerMonth) return "Unlimited classes";
    return `${classesPerMonth} ${classesPerMonth === 1 ? "class" : "classes"} a month`;
}

function people(n: number): string {
    return `${n} ${n === 1 ? "person" : "people"}`;
}

/**
 * Who pays what, as Plan Detail says it: "12 people · current price" and
 * "₹1,500 / month", then each older price the API lists.
 */
export function payRows(
    plan: Pick<Plan, "byPrice">,
): { label: string; amount: string; older: boolean }[] {
    return plan.byPrice.map((b) => ({
        label: `${people(b.count)} · ${b.current ? "current price" : "older price"}`,
        amount: longPrice(b.price, b.currency, b.interval),
        older: !b.current,
    }));
}

/** A plan card's notes: "3 still on ₹1,200 — they keep it". */
export function olderPriceNotes(plan: Pick<Plan, "byPrice">): string[] {
    return plan.byPrice
        .filter((b) => !b.current)
        .map(
            (b) =>
                `${b.count} still on ${money(b.price, b.currency)} — they keep it`,
        );
}

/**
 * Whether they keep an older price: the plan sells for something else now.
 * Only said when the currencies agree — two currencies are two prices, not
 * an older one.
 */
export function olderPrice(
    sub: Pick<Subscription, "price" | "currency" | "plan">,
    plans: readonly Pick<Plan, "id" | "price" | "currency">[],
): { listPrice: string } | null {
    const plan = plans.find((p) => p.id === sub.plan.id);
    if (plan?.currency !== sub.currency) return null;
    return Number(plan.price) !== Number(sub.price)
        ? { listPrice: plan.price }
        : null;
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
    const d = (at: string) => dayText(at, tz, now);
    const ending = tab === "active" && sub.endsAt ? sub.endsAt : null;
    const pill = ending
        ? { tone: "accent" as const, label: `Ends ${d(ending)}` }
        : { tone: TAB_TONE[tab], label: TAB_LABEL[tab] };
    const next = sub.pendingPlan ?? sub;
    const charging = chargingText(sub, now);
    if (tab === "failed") {
        const due = sub.failedCharge?.dueAt;
        return {
            pill,
            big: money(sub.failedCharge?.total ?? sub.price, sub.currency),
            when: due ? `failed ${d(due)}` : "failed",
            line: charging
                ? `${charging}. Nothing else can be charged until the bank answers.`
                : `${failWhy(sub, now)}. Nothing is collected until it's paid.`,
        };
    }
    if (tab === "paused") {
        return {
            pill,
            big: "—",
            when: "",
            line: `${pausedLine(sub, now)} Nothing is charged while paused.`,
        };
    }
    if (tab === "cancelled") {
        return {
            pill,
            big: "—",
            when: "",
            line: `Cancelled. Ended ${sub.cancelledAt ? d(sub.cancelledAt) : "at the end of its period"}. Nothing more is charged.`,
        };
    }
    if (ending) {
        return {
            pill,
            big: "—",
            when: "",
            line: `Ends ${d(ending)}. No more charges — what's paid for still happens.`,
        };
    }
    if (sub.startsAt) {
        return {
            pill,
            big: money(sub.price, sub.currency),
            when: `starts ${d(sub.startsAt)}`,
            line: `Starts ${d(sub.startsAt)}. Nothing is charged before then.`,
        };
    }
    if (!sub.nextRenewalAt) {
        return { pill, big: "—", when: "", line: "Nothing is due to renew." };
    }
    const on = d(sub.nextRenewalAt);
    return {
        pill,
        big: money(next.price, next.currency),
        when: on,
        line: charging
            ? `${charging} for this period. Next: ${money(next.price, next.currency)} on ${on}`
            : `${money(next.price, next.currency)} on ${on} · ${how ? `pays by ${how}` : "invoiced with a pay link"}`,
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
            label: dayText(c.date, sub.timezone, now, true),
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
    ONLINE: "the pay link",
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
            ? `${dayText(c.periodStart, timeZone, now)} – ${dayText(
                  // The period's end is the next one's start: say the last day.
                  new Date(Date.parse(c.periodEnd) - 1).toISOString(),
                  timeZone,
                  now,
              )}`
            : "";
    const how =
        c.standing === "PAID" && c.payment
            ? `paid by ${METHOD[c.payment.method] ?? "hand"}`
            : c.standing === "OVERDUE" && c.dueAt
              ? `due ${dayText(c.dueAt, timeZone, now)}`
              : "";
    return {
        id: c.id,
        date: dayText(c.issuedAt ?? c.createdAt, timeZone, now),
        result,
        tone,
        note: [period, how].filter(Boolean).join(" · "),
        amount: money(c.total, c.currency),
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
    NOT_REFUNDED: "not refunded — refund it from your payment provider",
};

function autopayCheckText(
    check: NonNullable<SubscriptionAutopay["check"]>,
): string {
    return `${money(check.amount, check.currency)} check ${CHECK_STATE[check.state]}`;
}

function autopayStateText(autopay: SubscriptionAutopay): string {
    const method = autopay.method ? AUTOPAY_METHOD[autopay.method] : null;
    const how = [method, autopay.hint].filter(Boolean).join(" · ");
    const withHow = (head: string) => (how ? `${head} · ${how}` : head);
    switch (autopay.state) {
        case "ON": {
            const limit = autopay.limit
                ? ` · limit ${money(autopay.limit, autopay.currency)}`
                : "";
            return `${withHow("Autopay on")}${limit}`;
        }
        case "PAUSED":
            return `${withHow("Autopay paused")} — paused in their UPI app`;
        case "PENDING":
            return `${withHow("Autopay pending")} — waiting for them to approve it`;
        case "FAILED":
            return `${withHow("Autopay failed")} — ${
                AUTOPAY_FAILED[autopay.failure ?? ""] ??
                AUTOPAY_FAILED.NOT_APPROVED
            }`;
    }
}

/** "UPI", "the pay link" — how the latest paid charge was paid, if any was. */
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
): string {
    const issued = charges.filter((c) => c.status !== "DRAFT");
    if (!issued.length) return "";
    if (issued.some((c) => c.gst)) return "Each renewal makes a GST invoice.";
    return where === "list"
        ? "Not GST-registered — renewals make receipts."
        : "Not GST-registered — receipts, not tax invoices.";
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
            text: "Renewals haven't run yet — invoices go out when they do.",
            late: true,
        };
    }
    const dueBy = Date.parse(r.nextCheckAt ?? r.lastCheckedAt);
    const late = dueBy + 5 * 60_000 < now.getTime();
    const last = new Date(r.lastCheckedAt);
    const key = (d: Date) =>
        new Intl.DateTimeFormat("en-CA", { timeZone }).format(d);
    const time = new Intl.DateTimeFormat(DISPLAY_LOCALE, {
        timeZone,
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
    }).format(last);
    const day =
        key(last) === key(now)
            ? "Today"
            : key(last) === key(new Date(now.getTime() - DAY))
              ? "Yesterday"
              : dayText(r.lastCheckedAt, timeZone, now);
    return {
        text: late
            ? `Renewals last ran ${day}, ${time} — later than it should have; renewals wait until it runs again.`
            : `Renewals last ran ${day}, ${time}.`,
        late,
    };
}

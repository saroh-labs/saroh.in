import { currencySymbol, formatMoneyMajor } from "@/lib/format/money";

import type { CalendarMonth, LayerKey, MoneyEntry } from "./types";

/**
 * The calendar's money: decimal strings from the API, summed in minor units so
 * a paisa is never lost to a float, and drawn two ways — whole in the panel and
 * the summary, short in a day's cell, where "₹14.7k" has to fit beside the
 * date on a phone-width column.
 */

/** "1250.50" → 125050. */
export function fromMajor(amount: string): number {
    const value = Number(amount);
    return Number.isFinite(value) ? Math.round(value * 100) : 0;
}

/** "1250.50" → 1250.5. */
export function toMajor(amount: string): number {
    return fromMajor(amount) / 100;
}

/** "₹29,180" — the full amount, for the summary and the day panel. */
export function wholeMoney(amount: number, currency: string): string {
    return formatMoneyMajor(Math.round(amount), currency) ?? "";
}

/** "₹3.8k", "₹960" — a day cell's takings, as the design writes them. */
export function shortMoney(amount: number, currency: string): string {
    const sign = currencySymbol(currency);
    if (amount >= 1000) return `${sign}${Math.round(amount / 100) / 10}k`;
    return `${sign}${Math.round(amount)}`;
}

/*
 * In, out and due (plan 005 E23, R13). The API sends them only to a caller
 * holding `payment:read` (E19), as entries that each count a rupee once; the
 * cells, the month strip, the day panel and the export all add up those
 * same entries, so the four cannot disagree. Amounts below are minor units.
 */

/** The month's entries, or null: no `payment:read`, or not all added up. */
export function monthEntries(month: CalendarMonth): MoneyEntry[] | null {
    const money = month.money;
    return money && money.total !== null ? money.entries : null;
}

/** The currency the money is shown in: the month's first, else `fallback`. */
export function moneyCurrency(
    month: CalendarMonth,
    fallback: string | null,
): string | null {
    return month.money?.total?.[0]?.currency ?? fallback;
}

/**
 * The entries a screen adds up: one currency — amounts in two are never
 * added — and none of a layer switched off, as the design's cells and
 * strip follow the switches.
 */
export function shownEntries(
    entries: MoneyEntry[],
    currency: string | null,
    off: Partial<Record<LayerKey, boolean>>,
): MoneyEntry[] {
    return entries.filter((e) => e.currency === currency && !off[e.layer]);
}

/**
 * The money a calendar draws: the currency it is shown in, the whole
 * month's entries (for the export) and those the switches leave on (for the
 * strip, the cells and the day). Null for a viewer without `payment:read`,
 * or when the month's money could not be added up.
 */
export interface CalendarCash {
    currency: string;
    all: MoneyEntry[];
    shown: MoneyEntry[];
}

export function calendarCash(
    month: CalendarMonth,
    off: Partial<Record<LayerKey, boolean>>,
    fallback: string | null,
): CalendarCash | null {
    const all = monthEntries(month);
    const currency = moneyCurrency(month, fallback);
    if (!all || !currency) return null;
    return { currency, all, shown: shownEntries(all, currency, off) };
}

export interface MoneySum {
    in: number;
    out: number;
    /** In less out. */
    net: number;
    due: number;
    failed: number;
}

/** Entries added up, in minor units. */
export function sumEntries(entries: MoneyEntry[]): MoneySum {
    const sum = { in: 0, out: 0, net: 0, due: 0, failed: 0 };
    for (const e of entries) {
        sum.in += e.in;
        sum.out += e.out;
        sum.due += e.due;
        sum.failed += e.failed;
    }
    sum.net = sum.in - sum.out;
    return sum;
}

/** Each day's sum, by "YYYY-MM-DD"; a day with no entry is absent. */
export function moneyByDate(entries: MoneyEntry[]): Map<string, MoneySum> {
    const per = new Map<string, MoneyEntry[]>();
    for (const e of entries) per.set(e.date, [...(per.get(e.date) ?? []), e]);
    const sums = new Map<string, MoneySum>();
    per.forEach((list, date) => sums.set(date, sumEntries(list)));
    return sums;
}

/** "₹29,180" from minor units; "−₹400" below zero. */
export function minorMoney(minor: number, currency: string): string {
    const whole = wholeMoney(Math.abs(minor) / 100, currency);
    return minor < 0 ? `−${whole}` : whole;
}

/** A day cell's "+₹3.8k" and "−₹200"; empty when nothing moved that way. */
export function cellMoney(
    sum: MoneySum | undefined,
    currency: string,
): { in: string; out: string } {
    return {
        in: sum?.in ? `+${shortMoney(sum.in / 100, currency)}` : "",
        out: sum?.out ? `−${shortMoney(sum.out / 100, currency)}` : "",
    };
}

export type StripKey = "in" | "out" | "net" | "due";

/** Where a month sits against today: whether its money is all in yet. */
export type MonthWhen = "past" | "current" | "future";

export function monthWhen(month: string, thisMonth: string): MonthWhen {
    if (month === thisMonth) return "current";
    return month < thisMonth ? "past" : "future";
}

export interface StripPart {
    key: StripKey;
    label: string;
    value: string;
    /** Drawn red: money went out. */
    out: boolean;
}

export interface StripAt {
    when: MonthWhen;
    today: string;
    currency: string;
}

/**
 * The entries In, Out and Net count: up to today in the current month (the
 * "so far"), all of a past month, none of a month still to come. Due is
 * money still asked for — overdue as well as ahead — so it counts every
 * entry, and the export's rows add up to the strip.
 */
function settled(entries: MoneyEntry[], { when, today }: StripAt) {
    if (when === "future") return [];
    return when === "current"
        ? entries.filter((e) => e.date <= today)
        : entries;
}

/**
 * The month strip, after the design: "In so far · Out so far · Net · Due".
 * "So far" only on the current month; a month still to come has nothing in
 * or out yet, so it says "—" rather than a zero.
 */
export function monthStrip(entries: MoneyEntry[], at: StripAt): StripPart[] {
    const done = sumEntries(settled(entries, at));
    const due = sumEntries(entries).due;
    const soFar = at.when === "current" ? " so far" : "";
    const ahead = at.when === "future";
    const money = (minor: number) =>
        ahead ? "—" : minorMoney(minor, at.currency);
    return [
        { key: "in", label: `In${soFar}`, value: money(done.in), out: false },
        {
            key: "out",
            label: `Out${soFar}`,
            value: money(done.out),
            out: !ahead && done.out > 0,
        },
        { key: "net", label: "Net", value: money(done.net), out: false },
        {
            key: "due",
            label: "Due",
            value: minorMoney(due, at.currency),
            out: false,
        },
    ];
}

const STRIP_TITLE: Record<StripKey, string> = {
    in: "Money in",
    out: "Money out",
    net: "Net",
    due: "Due",
};

/** The order a breakdown lists its kinds in — the calendar's own. */
const KIND_ORDER: LayerKey[] = [
    "orders",
    "bookings",
    "classes",
    "collections",
    "subscriptions",
    "invoices",
    "payments",
];

/**
 * One part of the strip by kind: "Money in by kind: Orders ₹18,400
 * Bookings ₹2,100", or "…: nothing". A kind is the layer the money belongs
 * to; one with nothing is left out.
 */
export function stripBreakdown(
    key: StripKey,
    entries: MoneyEntry[],
    at: StripAt & { labelOf: (layer: LayerKey) => string },
): { title: string; rows: { label: string; value: string }[] } {
    const counted = key === "due" ? entries : settled(entries, at);
    const rows = KIND_ORDER.flatMap((layer) => {
        const value = sumEntries(counted.filter((e) => e.layer === layer))[key];
        return value
            ? [
                  {
                      label: at.labelOf(layer),
                      value: minorMoney(value, at.currency),
                  },
              ]
            : [];
    });
    return {
        title: `${STRIP_TITLE[key]} by kind${rows.length ? ":" : ": nothing"}`,
        rows,
    };
}

/**
 * The day panel's line — In, Out, and Due when any — and what Out is made
 * of ("Out is a refund and fees."). Null on a day no money moved or is due.
 */
export function dayMoney(
    entries: MoneyEntry[],
    currency: string,
): { in: string; out: string; due: string | null; why: string } | null {
    const sum = sumEntries(entries);
    if (!sum.in && !sum.out && !sum.due) return null;
    const count = (kind: MoneyEntry["kind"]) =>
        entries.filter((e) => e.kind === kind && e.out > 0).length;
    const refunds = count("refund");
    const fees = count("fee");
    const whys = [
        refunds ? (refunds === 1 ? "a refund" : "refunds") : null,
        fees ? (fees === 1 ? "a fee" : "fees") : null,
    ].filter(Boolean);
    return {
        in: minorMoney(sum.in, currency),
        out: minorMoney(sum.out, currency),
        due: sum.due ? minorMoney(sum.due, currency) : null,
        why: whys.length ? `Out is ${whys.join(" and ")}.` : "",
    };
}

/**
 * A day's layer heading, in money: "₹2,400 · ₹600 due · ₹1,800 failed".
 * Empty when the layer took, and asks, nothing.
 */
export function groupMoney(entries: MoneyEntry[], currency: string): string {
    const sum = sumEntries(entries);
    return [
        sum.in ? minorMoney(sum.in, currency) : "",
        sum.due ? `${minorMoney(sum.due, currency)} due` : "",
        sum.failed ? `${minorMoney(sum.failed, currency)} failed` : "",
    ]
        .filter(Boolean)
        .join(" · ");
}

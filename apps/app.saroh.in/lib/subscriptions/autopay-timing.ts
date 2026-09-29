/**
 * "When autopay charges" (round-2 D13B, DEC-065): the merchant's choice of
 * when a renewal's autopay debit happens, for the business on the Plans
 * tab, and per plan on Plan Detail ("Use the business setting" or one of
 * the three). The API decides and stores; this is the words and the small
 * timeline each option shows.
 */

import { DISPLAY_LOCALE } from "@/lib/format/locale";

export const AUTOPAY_CHARGE_TIMINGS = [
    "ON_RENEWAL_DATE",
    "DAY_AFTER_RENEWAL",
    "ON_DUE_DATE",
] as const;
export type AutopayChargeTiming = (typeof AUTOPAY_CHARGE_TIMINGS)[number];

export function isAutopayChargeTiming(v: unknown): v is AutopayChargeTiming {
    return (
        typeof v === "string" &&
        (AUTOPAY_CHARGE_TIMINGS as readonly string[]).includes(v)
    );
}

/** The business's setting as the API gives it (absent before D13B). */
export interface AutopayTimingSettings {
    /** A provider that takes autopay, with its charging on. Off: hidden. */
    available: boolean;
    chargeTiming: AutopayChargeTiming;
    /** Days early an ON_RENEWAL_DATE invoice goes out (2). */
    leadDays: number;
    /** The bank's notice, in hours before a UPI debit (26). */
    noticeHours: number;
    /** Days from an invoice's issue to its due date (7). */
    dueDays: number;
}

const int = (v: unknown, fallback: number) =>
    typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : fallback;

/** The API's `autopay` block, checked; anything strange reads as none. */
export function autopayTimingSettingsOf(
    v: unknown,
): AutopayTimingSettings | null {
    if (!v || typeof v !== "object") return null;
    const r = v as Record<string, unknown>;
    if (typeof r.available !== "boolean") return null;
    if (!isAutopayChargeTiming(r.chargeTiming)) return null;
    return {
        available: r.available,
        chargeTiming: r.chargeTiming,
        leadDays: int(r.leadDays, 2),
        noticeHours: int(r.noticeHours, 26),
        dueDays: int(r.dueDays, 7),
    };
}

export interface TimingOption {
    value: AutopayChargeTiming;
    title: string;
    /** One line: what it means for the money and for a Retry. */
    consequence: string;
    isDefault: boolean;
}

export function timingOptions(
    s: Pick<AutopayTimingSettings, "leadDays" | "dueDays">,
): TimingOption[] {
    const lead = days(s.leadDays);
    return [
        {
            value: "ON_RENEWAL_DATE",
            title: "Charge on the renewal date",
            consequence: `The money comes in on the renewal date. The invoice and bank notice go out ${lead} early, and are cancelled if they cancel or pause before then.`,
            isDefault: false,
        },
        {
            value: "DAY_AFTER_RENEWAL",
            title: "Charge the day after renewal",
            consequence:
                "The invoice goes out on the renewal date and autopay charges a day later. There's time for a Retry before it's overdue.",
            isDefault: true,
        },
        {
            value: "ON_DUE_DATE",
            title: "Charge on the due date",
            consequence: `The invoice goes out on the renewal date and autopay charges on its due date, ${days(s.dueDays)} later. No time for a Retry before it's overdue.`,
            isDefault: false,
        },
    ];
}

function days(n: number): string {
    return `${n} ${n === 1 ? "day" : "days"}`;
}

/** The option's title, for a plan that follows the business. */
export function timingTitle(timing: AutopayChargeTiming): string {
    return (
        timingOptions({ leadDays: 2, dueDays: 7 }).find(
            (o) => o.value === timing,
        )?.title ?? ""
    );
}

export interface TimelineStep {
    /** "Invoice + bank notice", "Bank notice", "Charged". */
    what: string;
    /** "27 Sep". */
    day: string;
    /** "renewal", "due date". */
    note: string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function dayLabel(ms: number): string {
    return (
        new Intl.DateTimeFormat(DISPLAY_LOCALE, {
            timeZone: "UTC",
            day: "numeric",
            month: "short",
        })
            .format(new Date(ms))
            // ICU's en-GB says "Sept"; every other month is three letters.
            .replace("Sept", "Sep")
    );
}

/**
 * The small timeline an option shows for one renewal: when the invoice and
 * the bank's notice go out, and when autopay charges. `renewal` is a day
 * ("2026-09-29"); days are whole days, as the merchant reads them.
 */
export function timingTimeline(
    timing: AutopayChargeTiming,
    renewal: string,
    s: Pick<AutopayTimingSettings, "leadDays" | "dueDays">,
): TimelineStep[] {
    const r = Date.parse(`${renewal}T00:00:00Z`);
    const at = (offset: number) => dayLabel(r + offset * DAY_MS);
    switch (timing) {
        case "ON_RENEWAL_DATE":
            return [
                {
                    what: "Invoice + bank notice",
                    day: at(-s.leadDays),
                    note: null,
                },
                { what: "Charged", day: at(0), note: "renewal" },
            ];
        case "DAY_AFTER_RENEWAL":
            return [
                { what: "Invoice + bank notice", day: at(0), note: "renewal" },
                { what: "Charged", day: at(1), note: null },
            ];
        case "ON_DUE_DATE":
            return [
                { what: "Invoice", day: at(0), note: "renewal" },
                {
                    what: "Bank notice",
                    day: at(s.dueDays - s.leadDays),
                    note: null,
                },
                { what: "Charged", day: at(s.dueDays), note: "due date" },
            ];
    }
}

/** The timeline as one line, for a screen reader and the tests. */
export function timelineText(steps: TimelineStep[]): string {
    return steps
        .map((step, i) => {
            const what = i === 0 ? step.what : step.what.toLowerCase();
            return `${what} ${step.day}${step.note ? ` (${step.note})` : ""}`;
        })
        .join(" → ");
}

/** The sample renewal the previews use: a week from `now`, as a day. */
export function sampleRenewal(now: Date): string {
    return new Date(now.getTime() + 7 * DAY_MS).toISOString().slice(0, 10);
}

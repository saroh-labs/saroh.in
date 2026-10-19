import { formatPaise } from "./billing-words";

/**
 * A business's own commission rate in the console's words (DEC-169,
 * #1035): the shapes `GET /admin/organizations/:id/commission-rate` and
 * its dry run answer with, the Earns from chips and what each part says.
 * Client-safe: no `next/headers`. Rates arrive in basis points; no rate is
 * ever written in the console.
 */

export interface OwnRateView {
    id: string;
    platformAdminId: string;
    managerName: string;
    basisPoints: number;
    earnsFrom: string;
    /** "2026-09-10": its first day, in India. */
    earnsFromDay: string;
    until: string | null;
    /** Its last day, in India; null while it runs on. */
    lastDay: string | null;
    setByName: string;
    reason: string;
    createdAt: string;
    endedAt: string | null;
    endedReason: string | null;
}

export interface OwnRateSummary {
    organizationId: string;
    businessName: string;
    dates: {
        joined: string;
        firstPaidPlan: string | null;
        managerSince: string | null;
    };
    manager: { platformAdminId: string; name: string } | null;
    current: OwnRateView | null;
    upcoming: OwnRateView | null;
    history: OwnRateView[];
}

export interface OwnRatePreview {
    earnsFromDay: string;
    lastDay: string | null;
    managerName: string;
    payments: number;
    amountPaise: number;
    alreadyPriced: number;
    replaces: OwnRateView | null;
}

/** "10 Sep" this year, "10 Sep 2025" another. A day is India's, as sent. */
export function dayLabel(day: string, today: string = todayInIndia()): string {
    const at = new Date(`${day}T00:00:00.000Z`);
    if (Number.isNaN(at.getTime())) return day;
    return new Intl.DateTimeFormat("en-IN", {
        day: "numeric",
        month: "short",
        ...(day.slice(0, 4) === today.slice(0, 4) ? {} : { year: "numeric" }),
        timeZone: "UTC",
    }).format(at);
}

/** Today in India, as a day ("2026-10-19"). */
export function todayInIndia(now: Date = new Date()): string {
    return new Date(now.getTime() + 330 * 60 * 1000).toISOString().slice(0, 10);
}

export interface EarnsFromChip {
    label: string;
    day: string;
    /** Why it can't be picked; null when it can. */
    disabled: string | null;
    /** The chip's words, when not "‹label› · ‹day›". */
    text?: string;
}

/** The first day of the month `day` is in ("2027-01-20" → "2027-01-01"). */
const monthStart = (day: string) => `${day.slice(0, 7)}-01`;

/** "Jan 2027" or "Jan" this year. */
function monthLabel(day: string, today: string = todayInIndia()): string {
    const at = new Date(`${monthStart(day)}T00:00:00.000Z`);
    if (Number.isNaN(at.getTime())) return day;
    return new Intl.DateTimeFormat("en-IN", {
        month: "short",
        ...(day.slice(0, 4) === today.slice(0, 4) ? {} : { year: "numeric" }),
        timeZone: "UTC",
    }).format(at);
}

/**
 * The first day an own rate can earn from, as the API rules it (owner, 19
 * Oct): the later of the business's first paid plan and the first day of
 * the month its manager took it on ("the month counts"). A business that
 * joined with no manager earns that manager nothing from the months before
 * they were added. Null with no paid plan.
 */
export function earliestDay(
    summary: OwnRateSummary,
): { day: string; by: "first-paid" | "manager" } | null {
    const first = summary.dates.firstPaidPlan;
    if (!first) return null;
    const since =
        summary.manager && summary.dates.managerSince
            ? monthStart(summary.dates.managerSince)
            : null;
    return since && since >= first
        ? { day: since, by: "manager" }
        : { day: first, by: "first-paid" };
}

/**
 * The one-tap days beside Earns from: the start of the month this manager
 * took it on ("From 1 Jan, the month Arjun took it on") and the first paid
 * plan, each only when a rate may start then, and when the business
 * joined, shown off with why when it is earlier than that.
 */
export function earnsFromChips(summary: OwnRateSummary): EarnsFromChip[] {
    const floor = earliestDay(summary);
    const name = summary.manager?.name;
    const why = (day: string): string | null => {
        if (!floor) return "It hasn't paid for a plan yet";
        if (day >= floor.day) return null;
        return floor.by === "manager" && name
            ? `Before the month ${name} took it on`
            : "Before its first paid plan";
    };
    const chips: EarnsFromChip[] = [
        {
            label: "Joined",
            day: summary.dates.joined,
            disabled: why(summary.dates.joined),
        },
    ];
    const first = summary.dates.firstPaidPlan;
    if (first && why(first) === null) {
        chips.push({ label: "First paid plan", day: first, disabled: null });
    }
    const since = summary.dates.managerSince;
    if (since && name && why(monthStart(since)) === null) {
        const from = monthStart(since);
        chips.push({
            label: `${name} took it on`,
            day: from,
            text: `From ${dayLabel(from)}, the month ${name} took it on`,
            disabled: null,
        });
    }
    return chips;
}

/** Why the dialog can't set a rate at all, or null. */
export function ownRateBlocked(summary: OwnRateSummary): string | null {
    if (!summary.manager) {
        return "This business has no account manager. Give it one first.";
    }
    if (!summary.dates.firstPaidPlan) {
        return "This business hasn't paid for a plan yet. Its own rate can be set once it has.";
    }
    return null;
}

/** Why the typed days won't do, or null, as the API would say it. */
export function earnsFromProblem(
    summary: OwnRateSummary,
    earnsFrom: string,
    lastDay: string,
): string | null {
    if (!earnsFrom) return "Pick the day it earns from.";
    const floor = earliestDay(summary);
    if (!floor) return ownRateBlocked(summary);
    if (earnsFrom < floor.day) {
        return floor.by === "manager" && summary.manager
            ? `${summary.manager.name} took it on in ${monthLabel(floor.day)}. A rate can start from ${dayLabel(floor.day)}, the start of that month.`
            : `It can earn from ${dayLabel(floor.day)} at the earliest, the day of its first paid plan.`;
    }
    if (lastDay && lastDay < earnsFrom) {
        return "Its last day comes before the day it earns from.";
    }
    return null;
}

/** "Own rate N% from 10 Sep", "… until 30 Sep", "Own rate N% starts 1 Nov". */
export function ownRateLine(rate: OwnRateView, rateText: string): string {
    const now = todayInIndia();
    const from =
        rate.earnsFromDay > now
            ? `starts ${dayLabel(rate.earnsFromDay)}`
            : `from ${dayLabel(rate.earnsFromDay)}`;
    const until = rate.lastDay ? ` until ${dayLabel(rate.lastDay)}` : "";
    return `Own rate ${rateText} ${from}${until}`;
}

/** The dry run in a sentence: what saving adds, and what it leaves. */
export function previewWords(preview: OwnRatePreview): string {
    const since = dayLabel(preview.earnsFromDay);
    const parts: string[] = [];
    if (preview.payments === 0) {
        parts.push(
            `No payment since ${since} is waiting for a rate, so nothing earlier is paid; payments from now on earn at it.`,
        );
    } else {
        parts.push(
            `${preview.payments} ${preview.payments === 1 ? "payment" : "payments"} since ${since} get commission: ${formatPaise(preview.amountPaise)} to ${preview.managerName}.`,
        );
    }
    if (preview.alreadyPriced > 0) {
        parts.push(
            `${preview.alreadyPriced} already priced at the general rate ${preview.alreadyPriced === 1 ? "keeps its" : "keep theirs"}.`,
        );
    }
    if (preview.replaces) {
        parts.push(
            `It replaces the own rate from ${dayLabel(preview.replaces.earnsFromDay)}.`,
        );
    }
    return parts.join(" ");
}

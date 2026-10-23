import { formatDay } from "@/lib/format/datetime";
import { formatNumber } from "@/lib/format/money";
import { count } from "@/lib/format/plural";

import { capitalise, lastPeriod } from "./compare-words";
import type { InsightsPeriod } from "./period";
import type {
    SourceRowRead,
    SourcesRead,
    VisitPathRead,
    VisitSource,
} from "./reads";

/**
 * The words of "From visit to paid" and "Where do visitors come from?"
 * (DEC-171, plan U16, #1101; boards `IBFromD`, `IBFromP`, `IBOverviewD`).
 * Pure: tested in `sources-words.test.ts`.
 *
 * A share is said as a count reads, "1 in 7", "3 in 4", "about half",
 * never a percentage. What is counted is visits (U15 sends each step once a
 * visit, with no visitor), so the words say visits, never people.
 */

/** Each source as the table names it (U15's five groups). */
export const SOURCE_NAME: Record<VisitSource, string> = {
    instagram: "Instagram",
    google: "Google search",
    whatsapp: "WhatsApp links",
    direct: "Typed your address",
    other: "Other sites",
};

/** Each source at the start of a sentence, and whether it is many. */
const SUBJECT: Record<VisitSource, { name: string; many: boolean }> = {
    instagram: { name: "Instagram", many: false },
    google: { name: "Google search", many: false },
    whatsapp: { name: "WhatsApp links", many: true },
    direct: { name: "People typing your address", many: true },
    other: { name: "Other sites", many: true },
};

/** Fewer visits than this and a source's share says too little to compare. */
export const SHARE_MIN_VISITS = 5;

/** Shares a count reads well as, from a fifth up. */
const SHARES: readonly [number, string][] = [
    [1 / 5, "1 in 5"],
    [1 / 4, "1 in 4"],
    [1 / 3, "1 in 3"],
    [2 / 5, "2 in 5"],
    [1 / 2, "about half"],
    [2 / 3, "2 in 3"],
    [3 / 4, "3 in 4"],
    [4 / 5, "4 in 5"],
    [9 / 10, "9 in 10"],
];

/**
 * How many of `whole` were `part`, as a count reads: "1 in 7", "2 in 3",
 * "about half", "nearly all", "all", "none". Null when there is no whole
 * to say it of.
 */
export function oneIn(part: number, whole: number): string | null {
    if (whole <= 0) return null;
    if (part <= 0) return "none";
    if (part >= whole) return "all";
    const share = part / whole;
    if (share >= 0.95) return "nearly all";
    if (share < 0.2) return `1 in ${formatNumber(Math.round(whole / part))}`;
    let best = SHARES[0];
    for (const candidate of SHARES) {
        if (Math.abs(candidate[0] - share) < Math.abs(best[0] - share)) {
            best = candidate;
        }
    }
    return best[1];
}

/** "1 in 7 visits ended in a payment." */
function paidSentence(path: VisitPathRead): string {
    const share = oneIn(path.paid, path.visits);
    switch (share) {
        case null:
            return "";
        case "none":
            return `None of the ${count(path.visits, "visit")} ended in a payment yet.`;
        case "all":
            return path.visits === 1
                ? "The one visit ended in a payment."
                : "Every visit ended in a payment.";
        case "nearly all":
            return "Nearly every visit ended in a payment.";
        case "about half":
            return "About half the visits ended in a payment.";
        default:
            return `${share} visits ended in a payment.`;
    }
}

/** Where the most are lost, between two steps. */
const GAP = [
    "visiting and looking",
    "looking and starting",
    "starting and paying",
] as const;

/**
 * "From visit to paid" in one or two sentences: how many visits ended in
 * a payment, then where the most are lost. "1 in 7 visits ended in a
 * payment. Most who start an order or booking finish it. The biggest drop
 * is between looking and starting."
 */
export function pathAnswer(
    path: VisitPathRead,
    period: InsightsPeriod,
): string {
    if (path.visits <= 0) {
        return `No visits counted in ${lastPeriod(period)}.`;
    }
    const lines = [paidSentence(path)];
    const rates = [
        path.visits > 0 ? path.looked / path.visits : null,
        path.looked > 0 ? path.started / path.looked : null,
        path.started > 0 ? path.paid / path.started : null,
    ];
    let worst = -1;
    rates.forEach((rate, i) => {
        if (rate === null) return;
        if (worst < 0 || rate < (rates[worst] ?? 1)) worst = i;
    });
    const finish = rates[2];
    if (finish !== null && finish >= 0.5 && worst !== 2) {
        lines.push("Most who start an order or booking finish it.");
    }
    if (worst >= 0 && (rates[worst] ?? 1) < 1) {
        lines.push(`The biggest drop is between ${GAP[worst]}.`);
    }
    return lines.join(" ");
}

/** One of the four steps, as the path draws it. */
export interface PathStep {
    key: keyof VisitPathRead;
    label: string;
    /** "1 in 3 of them"; null on the first step. */
    share: string | null;
    value: number;
    /** The bar's width, against the visits. */
    widthPercent: number;
}

const STEP_LABEL: Record<keyof VisitPathRead, string> = {
    visits: "Visited your site",
    looked: "Looked at a product or class",
    started: "Started an order or booking",
    paid: "Paid",
};

/** The four steps, each with its share of the one before. */
export function pathSteps(path: VisitPathRead): PathStep[] {
    const keys: (keyof VisitPathRead)[] = [
        "visits",
        "looked",
        "started",
        "paid",
    ];
    return keys.map((key, i) => {
        const value = path[key];
        const prev = i > 0 ? path[keys[i - 1]] : null;
        const share = prev === null ? null : oneIn(value, prev);
        return {
            key,
            label: STEP_LABEL[key],
            share: share === null ? null : `${capitalise(share)} of them`,
            value,
            widthPercent:
                path.visits > 0 && value > 0
                    ? Math.max(1, Math.round((value / path.visits) * 100))
                    : 0,
        };
    });
}

/** A row's share that paid, as the table's last column says it. */
export interface PaidShare {
    /** "1 in 9", "None", "All"; null when there were no visits to say it of. */
    words: string | null;
    /** The bar, against the row that did best. */
    widthPercent: number;
}

const rate = (row: Pick<SourceRowRead, "visits" | "paid">) =>
    row.visits > 0 ? Math.min(1, row.paid / row.visits) : 0;

/** How many paid, per row, each bar against the best. */
export function paidShares(rows: readonly SourceRowRead[]): PaidShare[] {
    const best = rows.reduce((m, r) => Math.max(m, rate(r)), 0);
    return rows.map((row) => {
        const words = oneIn(row.paid, row.visits);
        return {
            words: words === null ? null : capitalise(words),
            widthPercent:
                best > 0 && rate(row) > 0
                    ? Math.max(2, Math.round((rate(row) / best) * 100))
                    : 0,
        };
    });
}

const bring = (s: VisitSource) =>
    `${SUBJECT[s].name} ${SUBJECT[s].many ? "bring" : "brings"}`;

/**
 * "Where do visitors come from?" in a sentence: which source brings the
 * most visits and, when another turns more of its visits into payments,
 * that one too. "Instagram brings the most visits. Google search brings
 * fewer, but more of them pay."
 */
export function sourcesAnswer(
    rows: readonly SourceRowRead[],
    period: InsightsPeriod,
): string {
    const visited = rows.filter((r) => r.visits > 0);
    if (visited.length === 0) {
        return `No visits counted in ${lastPeriod(period)}.`;
    }
    const top = visited.reduce((a, b) => (b.visits > a.visits ? b : a));
    const lead = `${bring(top.source)} the most visits.`;
    const fair = visited.filter(
        (r) => r.visits >= SHARE_MIN_VISITS && r.paid > 0,
    );
    if (fair.length === 0) return lead;
    const best = fair.reduce((a, b) => (rate(b) > rate(a) ? b : a));
    if (best !== top && rate(best) > rate(top)) {
        return `${lead} ${bring(best.source)} fewer, but more of them pay.`;
    }
    if (best === top && visited.length > 1) {
        return `${bring(top.source)} the most visits, and more of them pay than from anywhere else.`;
    }
    return lead;
}

/** "WhatsApp links had too few visits to show apart: …". */
export function foldedLine(folded: readonly VisitSource[]): string | null {
    if (folded.length === 0) return null;
    const names = folded.map((s) => SOURCE_NAME[s]);
    const list =
        names.length === 1
            ? names[0]
            : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
    return `${list} had too few visits to show apart, so ${folded.length === 1 ? "it is" : "they are"} counted in Other sites.`;
}

/**
 * From when where a visit came from is counted: said when counting began
 * inside the period, or hasn't begun. Null when the whole period is counted.
 */
export function countedFromLine(
    read: Pick<SourcesRead, "countedFrom" | "countedPart">,
    today?: string,
): string | null {
    if (read.countedFrom === null) {
        return "Where visits come from is counted from the next visit to your site.";
    }
    if (!read.countedPart) return null;
    return `Counted from ${formatDay(read.countedFrom, { today })}, when your site began noting where each visit came from.`;
}

/**
 * The Overview's answer to "Where do customers come from?" from the
 * sources (`IBOverviewD`): the source that brings the most, then how many
 * visits ended in a payment. Null when nothing was counted in the period:
 * the card then says the website's figures as before.
 */
export function overviewSourcesAnswer(read: SourcesRead): string | null {
    if (read.path.visits <= 0) return null;
    const visited = read.sources.filter((r) => r.visits > 0);
    if (visited.length === 0) return null;
    const top = visited.reduce((a, b) => (b.visits > a.visits ? b : a));
    return `${bring(top.source)} the most visits. ${paidSentence(read.path)}`;
}

/** The Overview card's rows: the first three sources and their visits. */
export function overviewSourceRows(
    read: SourcesRead,
): { key: VisitSource; name: string; visits: string }[] {
    return read.sources
        .filter((r) => r.visits > 0)
        .slice(0, 3)
        .map((r) => ({
            key: r.source,
            name: SOURCE_NAME[r.source],
            visits: count(r.visits, "visit"),
        }));
}

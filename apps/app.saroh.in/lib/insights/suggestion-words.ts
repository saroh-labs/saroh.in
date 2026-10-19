import { formatMoney, formatNumber } from "@/lib/format/money";
import { count } from "@/lib/format/plural";
import type { ShareLink } from "@/lib/sites/share-links";

import { lastPeriod } from "./compare-words";
import type { InsightsPeriod } from "./period";
import type { Suggestion } from "./reads";

/**
 * The words of Insights' "What to do next" card (DEC-171, plan U11, #1091;
 * boards `IBOverviewD`, `IBNextD`, `IBNotNowD`, `IBNoSuggD`, `IBNoSalesD`,
 * `IBMemberD`). The API (#1087) sends facts only; this says them, one
 * suggestion at a time: what to do, why it is worth doing, the button, and
 * which rule put it there. Pure: tested in `suggestion-words.test.ts`.
 */

export const SUGGESTION_HEADING = "What to do next";

/** "Hidden for 7 days.": the toast after Not now, with Undo. */
export const NOT_NOW_DONE = "Hidden for 7 days.";

export const NOTHING_TO_SUGGEST = "Nothing to suggest right now.";

/** Under the card, for a role without payments (`IBMemberD`). */
export const MONEY_SUGGESTIONS_HIDDEN =
    "Suggestions about money, like late bills, show only to people who can see payments.";

/** When a suggestion shows up, said where there is none (`IBNoSuggD`). */
export function whenSuggestionsShow(money: boolean): string {
    return money
        ? "Suggestions show up when a class is nearly always full, a bill is more than 3 weeks late, or something sells less than before."
        : "Suggestions show up when a class is nearly always full.";
}

/** "2 of 3": where this one is among them. */
export function placeLine(index: number, total: number): string {
    return `${index + 1} of ${total}`;
}

/** What the card says for one suggestion. */
export interface SuggestionWords {
    title: string;
    why: string;
    /** "Why you're seeing this: …", or null where it can't be put off. */
    rule: string | null;
    /** The button: a link, a reminder, or the shop link to copy. */
    action:
        | { kind: "link"; label: string; href: string }
        | { kind: "remind"; label: string; invoiceId: string; person: string }
        | { kind: "copy"; label: string; url: string };
    /** Names or amounts: a session recording hides it. */
    masked: boolean;
}

const RULE_LINE = {
    CLASS_FULL: "a class nearly always full",
    LATE_BILL: "a bill more than 3 weeks late",
    SELLING_LESS: "something selling less than before",
} as const;

function ruleLine(rule: keyof typeof RULE_LINE): string {
    return `Why you're seeing this: ${RULE_LINE[rule]}.`;
}

/** "the 4 before", after "fewer than". */
const BEFORE: Record<InsightsPeriod, string> = {
    "7d": "the 7 days before",
    "4w": "the 4 weeks before",
    "3m": "the 3 months before",
};

/** "your third best seller"; nothing past third. */
const RANK: Record<number, string> = {
    1: "your best seller",
    2: "your second best seller",
    3: "your third best seller",
};

/**
 * Where the website is not live yet, the first-sale card leads there: a
 * link nobody can open is never offered.
 */
export const WEBSITE_HREF = "/sites";

/**
 * The words for one suggestion. `share` is the live link the first-sale
 * suggestion copies (`shareLink`, the shop, else the website); `period` is
 * what selling less compared.
 */
export function suggestionWords(
    s: Suggestion,
    options: { period: InsightsPeriod; share: ShareLink | null },
): SuggestionWords {
    switch (s.rule) {
        case "FIRST_SALE":
            return firstSaleWords(options.share);
        case "CLASS_FULL": {
            const taken =
                s.fullPercent >= 100
                    ? "Every place was taken"
                    : `${s.fullPercent}% of its places were taken`;
            return {
                title: `Add another time for ${s.service.name}`,
                why: `${taken} across ${count(s.sessions, "class", "classes")} in the last 4 weeks.`,
                rule: ruleLine("CLASS_FULL"),
                action: {
                    kind: "link",
                    label: "Add a class time",
                    href: s.action.href,
                },
                masked: true,
            };
        }
        case "LATE_BILL": {
            const amount = formatMoney(s.leftToPayMinor, s.currency);
            const bill = s.invoice.number
                ? `Bill ${s.invoice.number}`
                : "The bill";
            const why = `${bill} is ${count(s.daysLate, "day")} late, more than 3 weeks.`;
            const trimmed = s.billedTo?.trim() ?? "";
            const name = trimmed === "" ? null : trimmed;
            if (s.action.kind === "REMIND") {
                return {
                    title: name
                        ? `Remind ${name} about ${amount}`
                        : `Send a reminder for ${amount}`,
                    why,
                    rule: ruleLine("LATE_BILL"),
                    action: {
                        kind: "remind",
                        label: "Send reminder",
                        invoiceId: s.action.invoiceId,
                        person: name?.split(/\s+/)[0] ?? "They",
                    },
                    masked: true,
                };
            }
            return {
                title: name
                    ? `${name} still owes ${amount}`
                    : `${amount} is still owed on a bill`,
                why,
                rule: ruleLine("LATE_BILL"),
                action: {
                    kind: "link",
                    label: "Open the bill",
                    href: s.action.href,
                },
                masked: true,
            };
        }
        case "SELLING_LESS": {
            const period = options.period;
            const sold =
                s.sold === 0
                    ? `None sold in ${lastPeriod(period)}, against ${formatNumber(s.soldBefore)} in ${BEFORE[period]}.`
                    : `${formatNumber(s.sold)} sold in ${lastPeriod(period)}, ${s.fewerPercent}% fewer than ${BEFORE[period]}.`;
            const rank = RANK[s.rankBefore];
            return {
                title: `${s.product.name} is selling less`,
                why: rank ? `${sold} It used to be ${rank}.` : sold,
                rule: ruleLine("SELLING_LESS"),
                action: {
                    kind: "link",
                    label: "Open the product",
                    href: s.action.href,
                },
                masked: true,
            };
        }
    }
}

/**
 * Before the first sale (`IBNoSalesD`): send the shop's link to people who
 * already buy, by copying it here. No live shop or website: open Website.
 */
function firstSaleWords(share: ShareLink | null): SuggestionWords {
    const why = "Most first orders come from people who know you.";
    if (!share) {
        return {
            title: "Put your website live, then send its link to 10 people who already buy from you",
            why,
            rule: null,
            action: { kind: "link", label: "Open Website", href: WEBSITE_HREF },
            masked: false,
        };
    }
    const what =
        share.kind === "site"
            ? "website"
            : share.kind === "book"
              ? "booking page"
              : "shop";
    return {
        title: `Send your ${what} link to 10 people who already buy from you`,
        why,
        rule: null,
        action: {
            kind: "copy",
            label: `Copy ${what} link`,
            url: share.url,
        },
        masked: false,
    };
}

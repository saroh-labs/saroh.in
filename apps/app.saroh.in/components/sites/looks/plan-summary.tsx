"use client";

import type { LookId } from "@saroh/block-contract";
import { LOOK_IDS } from "@saroh/block-contract";

import type { SiteStyleOptions } from "@/lib/sites/style";
import type { StyleChoiceRules } from "@/lib/sites/style-access";
import { lookName } from "./look-picker";

/** One line of the card: a part, what it holds, and how much is the plan's. */
export interface PlanLine {
    part: string;
    note: string;
    /** "Yours", "Some", or "4 of 7". */
    mark: string;
}

/** "Quiet, Folio and Live". */
function andList(names: string[]): string {
    return names.length < 2
        ? (names[0] ?? "")
        : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * The "On your plan" lines (`WXBBrandLocked`), every number counted from
 * the catalogue's rules (`StyleChoiceRules`), never written here. Null
 * when the plan refuses nothing: the card is for a plan without paid
 * styles.
 */
export function planLines(
    rules: StyleChoiceRules,
    options: SiteStyleOptions,
    looksOffered: boolean,
): PlanLine[] | null {
    const pairs = options.fontPairs ?? [];
    const freePairs = pairs.filter((p) => !rules.isPaid("fontPair", p.key));
    const paidLooks = LOOK_IDS.filter((l) => rules.isPaid("look", l));
    const colourways = options.colourways ?? [];
    const paidWays = colourways.filter((c) => rules.isPaid("colourway", c.id));
    const refusesAny =
        pairs.some((p) => rules.refuses("fontPair", p.key)) ||
        (looksOffered && LOOK_IDS.some((l) => rules.refuses("look", l))) ||
        colourways.some((c) => rules.refuses("colourway", c.id));
    if (!refusesAny) return null;

    const lines: PlanLine[] = [
        {
            part: "Colours, buttons and shapes",
            note:
                paidWays.length > 0
                    ? `Every colour and your brand colour. ${andList(paidWays.map((c) => c.name))} on paid plans`
                    : "Every colour, your brand colour, buttons, cards and corners",
            mark: paidWays.length > 0 ? "Some" : "Yours",
        },
    ];
    if (pairs.length > 0) {
        const more = pairs.length - freePairs.length;
        lines.push({
            part: "Fonts",
            note:
                more > 0
                    ? `${freePairs.length} ${freePairs.length === 1 ? "pair" : "pairs"}. ${more} more on paid plans`
                    : "Every pair",
            mark: more > 0 ? `${freePairs.length} of ${pairs.length}` : "Yours",
        });
    }
    if (looksOffered) {
        const free: (LookId | null)[] = [
            null,
            ...LOOK_IDS.filter((l) => !paidLooks.includes(l)),
        ];
        lines.push({
            part: "Looks",
            note:
                paidLooks.length > 0
                    ? `${andList(free.map(lookName))}. ${andList(paidLooks.map(lookName))} on paid plans`
                    : "Every look",
            mark: paidLooks.length > 0 ? "Some" : "Yours",
        });
    }
    return lines;
}

/**
 * "On your plan" (`WXBBrandLocked`): what of Brand this plan holds, part
 * by part. Paid choices are marked where they are chosen too, and a
 * refused one keeps what the site has.
 */
export function PlanSummary({ lines }: { lines: PlanLine[] }) {
    return (
        <section
            aria-labelledby="plan-summary-title"
            data-plan-summary=""
            className="space-y-2"
        >
            <h3 id="plan-summary-title" className="text-sm font-semibold">
                On your plan
            </h3>
            <ul className="divide-y rounded-[10px] border bg-card">
                {lines.map((l) => (
                    <li
                        key={l.part}
                        data-plan-line={l.part}
                        className="flex items-start gap-2 px-3 py-2.5"
                    >
                        <span className="min-w-0 flex-1 text-[0.8125rem] leading-snug">
                            <b className="block font-semibold">{l.part}</b>
                            <span className="text-xs text-muted-foreground">
                                {l.note}
                            </span>
                        </span>
                        <span className="shrink-0 text-xs font-semibold tabular-nums">
                            {l.mark}
                        </span>
                    </li>
                ))}
            </ul>
            <p className="text-xs leading-relaxed text-muted-foreground">
                Paid ones are marked where you choose them. Your site keeps
                everything it has, whatever you pick.
            </p>
        </section>
    );
}

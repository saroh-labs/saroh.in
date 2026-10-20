import { cn } from "@saroh/ui/lib/utils";
import { TextLink } from "@saroh/ui/text-link";
import { ArrowRight, ChevronUp } from "lucide-react";
import Link from "next/link";
import { useId } from "react";

import type { GoingCard } from "@/lib/home/week";
import { MONTH_HREF } from "@/lib/home/week";

/**
 * How it's going (DEC-171, plan U6, boards `HAPageD`, `HAMondayD`,
 * `HAMemberD`): the last 7 days against the 7 before, so a Monday no
 * longer reads "0 · 19 fewer than last week". Sales, bookings, orders and
 * what is owed, each a link to the rows it counts, and "See how the month
 * went" into Insights on 4 weeks for someone who may open Insights.
 *
 * It replaced "This week". The API sends each figure only to someone who
 * may read it (a Member sees bookings and orders, no money). The phone's
 * one-sentence form is U17's (`goingSentence`).
 */
export function HowItsGoing({
    cards,
    intro,
    insights,
    layout = "desk",
}: {
    cards: readonly GoingCard[];
    /** "The last 7 days, 13 to 19 Oct, compared with the 7 days before". */
    intro: string;
    /** Whether "See how the month went" is offered (Insights is open to them). */
    insights: boolean;
    /** `stack`: the interim phone layout's two columns, until U17. */
    layout?: "desk" | "stack";
}) {
    const headingId = useId();
    if (cards.length === 0) return null;
    return (
        <section aria-labelledby={headingId} className="grid min-w-0 gap-2.5">
            <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                <h2
                    id={headingId}
                    data-ph-unmask=""
                    className="font-display text-[19px] font-semibold leading-[1.25] tracking-[-0.02em]"
                >
                    How it&apos;s going
                </h2>
                {insights ? (
                    <TextLink
                        href={MONTH_HREF}
                        className="ml-auto inline-flex items-center gap-1 text-[12.5px] coarse:min-h-11"
                    >
                        See how the month went
                        <ArrowRight aria-hidden className="size-3.5" />
                    </TextLink>
                ) : null}
            </div>
            <p className="text-[12.5px] leading-[1.5] text-muted-foreground">
                {intro}
            </p>
            <ul
                className={cn(
                    "grid grid-cols-2 gap-3",
                    layout === "desk" &&
                        (cards.length >= 4
                            ? "lg:grid-cols-4"
                            : cards.length === 3
                              ? "lg:grid-cols-3"
                              : null),
                )}
            >
                {cards.map((card) => (
                    <li key={card.key} className="min-w-0">
                        <Link
                            href={card.href}
                            data-going={card.key}
                            className="flex h-full flex-col gap-[3px] rounded-xl border border-border bg-card px-[15px] py-[13px] text-foreground transition-colors duration-fast hover:border-border-strong hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:bg-muted"
                        >
                            <span
                                data-ph-unmask=""
                                className="text-[12.5px] text-muted-foreground"
                            >
                                {card.label}
                            </span>
                            <span className="font-display text-[21px] font-semibold tabular-nums tracking-[-0.02em]">
                                {card.value}
                            </span>
                            <span
                                data-tone={card.tone}
                                className={cn(
                                    "inline-flex items-start gap-[3px] text-pretty text-xs leading-[1.4]",
                                    card.tone === "up"
                                        ? "text-success-subtle-foreground"
                                        : card.tone === "bad"
                                          ? "font-semibold text-destructive-subtle-foreground"
                                          : "text-neutral-700 dark:text-muted-foreground",
                                )}
                            >
                                {card.tone === "up" ? (
                                    <ChevronUp
                                        aria-hidden
                                        className="mt-px size-3.5 shrink-0"
                                    />
                                ) : null}
                                {card.sub}
                            </span>
                        </Link>
                    </li>
                ))}
            </ul>
        </section>
    );
}

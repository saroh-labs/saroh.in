"use client";

import { Badge } from "@saroh/ui/badge";
import { cn } from "@saroh/ui/lib/utils";
import Link from "next/link";
import { useId, useState } from "react";

import {
    formatList,
    needLine,
    needTitle,
    needsState,
    shownNeeds,
    thingsLabel,
} from "@/lib/home/needs";
import type { HomeNeed, HomeUnavailable } from "@/lib/home/service";

import { TONE_BADGE } from "./tone";

/**
 * Needs you, as the Home design draws it (round 2, F3): one flat list, one
 * row per thing to do, ranked by the API — late work first, then what is
 * blocked, then what is due. Each row is its title and the line under it,
 * which together are the link, and a tag that says in words what the tone
 * colours.
 *
 * Twelve rows show, then "See all N" (default 121): a real control that
 * opens the rest in place, never hover. "Nothing needs you" is said only
 * when every source was read; with a part missing, the list says which part
 * it couldn't check instead (saroh-product-states).
 *
 * F4 adds each row's inline action (Mark sent, Retry, …) beside the tag.
 */
export function NeedsYou({
    needs,
    total,
    unavailable,
    next,
}: {
    needs: readonly HomeNeed[];
    /** How many things need doing; a "3 more" row stands for three. */
    total: number;
    unavailable: readonly HomeUnavailable[];
    /** After "Nothing needs you.": the next booking today, or the quiet. */
    next: string;
}) {
    const headingId = useId();
    const [expanded, setExpanded] = useState(false);
    const state = needsState(needs, unavailable);
    const { rows, more } = shownNeeds(needs, expanded);

    return (
        <section aria-labelledby={headingId} className="grid min-w-0 gap-[9px]">
            <div className="flex items-baseline gap-[9px]">
                <h2
                    id={headingId}
                    className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground"
                >
                    Needs you
                </h2>
                <span className="text-[12.5px] text-muted-foreground">
                    {thingsLabel(total)}
                </span>
            </div>

            {state === "clear" ? (
                <p className="rounded-xl border border-border bg-card px-4 py-3.5 text-sm text-neutral-700 dark:text-muted-foreground">
                    <strong className="font-semibold text-success-subtle-foreground">
                        Nothing needs you.
                    </strong>{" "}
                    {next}
                </p>
            ) : null}

            {state === "unknown" ? (
                // Not a success: nothing came back from the parts that
                // answered, and one didn't, so all Home can say is that.
                <p className="rounded-xl border border-border bg-card px-4 py-3.5 text-sm text-neutral-700 dark:text-muted-foreground">
                    <strong className="font-semibold text-foreground">
                        Nothing else we could check needs you.
                    </strong>{" "}
                    {formatList(unavailable.map((u) => u.label))} couldn't be
                    checked, so there may be more.
                </p>
            ) : null}

            {state === "list" ? (
                <ul className="overflow-hidden rounded-xl border border-border bg-card">
                    {rows.map((need, i) => (
                        <NeedRow key={need.id} need={need} first={i === 0} />
                    ))}
                </ul>
            ) : null}

            {more || expanded ? (
                <button
                    type="button"
                    aria-expanded={expanded}
                    onClick={() => setExpanded((open) => !open)}
                    className="justify-self-start rounded text-[12.5px] font-semibold text-brand underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 coarse:min-h-11"
                >
                    {expanded ? "Show fewer" : `See all ${total}`}
                </button>
            ) : null}
        </section>
    );
}

function NeedRow({ need, first }: { need: HomeNeed; first: boolean }) {
    const line = needLine(need);
    return (
        <li
            className={cn(
                "bg-card px-4 py-[13px]",
                !first && "border-t border-border",
            )}
        >
            <div className="flex flex-wrap items-start gap-3">
                {/* The title and its line are one link, 44px and taller for
                    a thumb, and it wraps before the tag is squeezed (§17). */}
                <Link
                    href={need.href}
                    className="grid min-w-0 flex-[1_1_260px] content-center gap-[3px] rounded text-foreground hover:text-brand-subtle-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 coarse:min-h-11"
                >
                    <span className="text-sm font-semibold">
                        {needTitle(need)}
                    </span>
                    {line ? (
                        <span className="text-pretty text-[12.5px] leading-[1.45] text-muted-foreground">
                            {line}
                        </span>
                    ) : null}
                </Link>
                {need.tag ? (
                    <Badge
                        variant={TONE_BADGE[need.tone]}
                        className="shrink-0 self-center whitespace-nowrap px-[9px] py-[3px] text-[11.5px] font-semibold"
                    >
                        {need.tag}
                    </Badge>
                ) : null}
            </div>
        </li>
    );
}

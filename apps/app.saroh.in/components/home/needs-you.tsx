"use client";

import { Badge } from "@saroh/ui/badge";
import { cn } from "@saroh/ui/lib/utils";
import Link from "next/link";
import { useId, useRef, useState } from "react";

import { arrivalProps } from "@/components/shared/arrival-props";
import { useArrivals } from "@/components/shared/use-arrivals";
import { openTotal } from "@/lib/home/inline-actions";
import { EmptyState } from "@saroh/ui/data-state";

import {
    formatList,
    IN_PROGRESS_HREF,
    inProgressLabel,
    needLine,
    needsState,
    needTitle,
    seeAllLabel,
    shownNeeds,
    thingsLabel,
} from "@/lib/home/needs";
import type { HomeNeed, HomeUnavailable } from "@/lib/home/service";

import { TextLink } from "@saroh/ui/text-link";
import {
    InlineButton,
    InlineConfirm,
    InlineDone,
    InlineLink,
} from "./inline-action";
import { TONE_BADGE } from "./tone";
import type { DoneRow, InlineActions } from "./use-inline-actions";
import { confirmKey, useInlineActions } from "./use-inline-actions";

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
 * A row the API gave an inline action (F4: Mark sent, Retry by payment link,
 * Send reminder, Reply) has its button beside the tag; it confirms in the
 * row first, and once done the row stays, struck through, saying what
 * happened (`use-inline-actions.ts`).
 */
export function NeedsYou({
    needs,
    total,
    inProgress = 0,
    unavailable,
    next,
}: {
    needs: readonly HomeNeed[];
    /** How many things need doing; a "3 more" row stands for three. */
    total: number;
    /**
     * Open orders due after tomorrow, left to Orders (DEC-163): one quiet
     * link beside the count, never a row or a note of its own.
     */
    inProgress?: number;
    unavailable: readonly HomeUnavailable[];
    /** After "Nothing needs you.": the next booking today, or the quiet. */
    next: string;
}) {
    const headingId = useId();
    const [expanded, setExpanded] = useState(false);
    const state = needsState(needs, unavailable);
    const { rows, more } = shownNeeds(needs, expanded);
    const actions = useInlineActions();
    const doneHere = needs.filter((n) => n.id in actions.done).length;
    // Something that started needing you while Home was open (live
    // refresh): its row enters, and wears an edge until touched. Judged on
    // the whole list, so "See all" opening the rest marks nothing.
    const arrivals = useArrivals(needs.map((n) => n.id));

    return (
        <section aria-labelledby={headingId} className="grid min-w-0 gap-[9px]">
            <div className="flex items-baseline gap-[9px]">
                <h2 id={headingId} className="label">
                    Needs you
                </h2>
                <span className="text-[12.5px] text-muted-foreground">
                    {thingsLabel(openTotal(total, doneHere))}
                </span>
                {inProgress > 0 ? (
                    <TextLink
                        href={IN_PROGRESS_HREF}
                        tone="muted"
                        className="text-[12.5px] coarse:min-h-11"
                    >
                        {inProgressLabel(inProgress, total)}
                    </TextLink>
                ) : null}
            </div>

            {state === "clear" ? (
                <EmptyState
                    size="inline"
                    className="rounded-xl border border-border bg-card px-4 py-3.5"
                    title="Nothing needs you."
                    description={next}
                />
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
                        <NeedRow
                            key={need.id}
                            need={need}
                            first={i === 0}
                            actions={actions}
                            done={actions.done[need.id] ?? null}
                            arrived={arrivals.isNew(need.id)}
                            onTouch={() => arrivals.touch(need.id)}
                        />
                    ))}
                </ul>
            ) : null}

            {more || expanded ? (
                <TextLink
                    aria-expanded={expanded}
                    onClick={() => setExpanded((open) => !open)}
                    className="justify-self-start text-[12.5px] coarse:min-h-11"
                >
                    {expanded ? "Show fewer" : seeAllLabel(needs)}
                </TextLink>
            ) : null}
        </section>
    );
}

/**
 * One row of the flat Needs you with its inline action, and the quiet one
 * beside it where the API sent one (A7's Turn down). Home A's groups draw
 * theirs with `NeedGroupBody` (`need-group-body.tsx`).
 */
export function NeedRow({
    need,
    first,
    actions,
    done,
    arrived,
    onTouch,
}: {
    need: HomeNeed;
    first: boolean;
    actions: InlineActions;
    done: DoneRow | null;
    /** It began needing you while Home was open: it enters, with an edge. */
    arrived: boolean;
    /** Pressed or focused: the edge goes. */
    onTouch: () => void;
}) {
    const line = needLine(need);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const secondRef = useRef<HTMLButtonElement>(null);
    const { inline, second } = need;
    const openFirst =
        inline !== undefined && actions.open === confirmKey(need.id) && !done;
    const openSecond =
        second !== undefined &&
        actions.open === confirmKey(need.id, "second") &&
        !done;
    const open = openFirst || openSecond;
    const arrival = arrivalProps(arrived && !done, onTouch);
    return (
        <li
            {...arrival}
            data-need-row=""
            className={cn(
                "px-4 py-[13px] transition-colors duration-fast",
                done ? "bg-muted" : "bg-card",
                !first && "border-t border-border",
                arrival.className,
            )}
        >
            <div className="flex flex-wrap items-start gap-3">
                {/* The title and its line are one link, 44px and taller for
                    a thumb, and it wraps before the tag is squeezed (§17). */}
                <Link
                    href={need.href}
                    className="grid min-w-0 flex-[1_1_260px] content-center gap-[3px] rounded text-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 coarse:min-h-11"
                >
                    <span
                        className={cn(
                            "text-sm font-semibold",
                            done && "text-muted-foreground line-through",
                        )}
                    >
                        {needTitle(need)}
                    </span>
                    {line ? (
                        <span className="text-pretty text-[12.5px] leading-[1.45] text-muted-foreground">
                            {line}
                        </span>
                    ) : null}
                </Link>
                {need.tag && !done ? (
                    <Badge
                        variant={TONE_BADGE[need.tone]}
                        size="sm"
                        className="shrink-0 self-center"
                    >
                        {need.tag}
                    </Badge>
                ) : null}
                {need.link && !done && !open ? (
                    <InlineLink link={need.link} />
                ) : null}
                {inline && !done && !open ? (
                    <InlineButton
                        inline={inline}
                        busy={actions.busy === need.id}
                        onOpen={() => actions.openFor(confirmKey(need.id))}
                        buttonRef={buttonRef}
                    />
                ) : null}
                {second && !done && !open ? (
                    <InlineButton
                        inline={second}
                        busy={actions.busy === need.id}
                        onOpen={() =>
                            actions.openFor(confirmKey(need.id, "second"))
                        }
                        buttonRef={secondRef}
                        quiet
                    />
                ) : null}
                {done ? <InlineDone row={done} /> : null}
            </div>
            {openFirst ? (
                <InlineConfirm
                    need={need}
                    inline={inline}
                    actions={actions}
                    onClose={() =>
                        // The button is back once the confirm has gone.
                        requestAnimationFrame(() => buttonRef.current?.focus())
                    }
                />
            ) : null}
            {openSecond ? (
                <InlineConfirm
                    need={need}
                    inline={second}
                    which="second"
                    actions={actions}
                    onClose={() =>
                        requestAnimationFrame(() => secondRef.current?.focus())
                    }
                />
            ) : null}
        </li>
    );
}

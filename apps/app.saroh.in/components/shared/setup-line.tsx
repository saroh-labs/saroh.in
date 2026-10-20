"use client";

import { cn } from "@saroh/ui/lib/utils";
import { ProgressBar } from "@saroh/ui/progress-bar";
import { TextLink } from "@saroh/ui/text-link";
import type { ReactNode } from "react";
import { useId, useState } from "react";

import { count as countOf } from "@/lib/format/plural";
import type { ChecklistRow } from "@/lib/setup-checklist";
import { orderRows } from "@/lib/setup-checklist";

import { ChecklistStep, HideForNow } from "./setup-checklist-row";

/**
 * The one setup checklist as one line (Home A, DEC-171, boards `HAPageD`
 * and `HASetupD`): once most steps are done, Home spends one line on
 * setup rather than a card of ticks. The title, "5 of 6 done", the bar and
 * Hide for now; the next step with its one button; and "Show the 5 done
 * steps", which opens every step in place ("Show fewer" folds them again).
 *
 * It is `SetupChecklist`'s compact form, never a checklist of its own: the
 * rows, their buttons and the count are the same pieces.
 */
export function SetupLine({
    name,
    title,
    count,
    done,
    total,
    rows,
    hide,
    className,
    children,
}: {
    name: string;
    title: string;
    /** "5 of 6 done". */
    count: string;
    done: number;
    total: number;
    rows: readonly ChecklistRow[];
    hide?: { onHide: () => void; onShow: () => void; said: string };
    className?: string;
    /** What is listed beside the steps and never counted. */
    children?: ReactNode;
}) {
    const headingId = useId();
    const listId = useId();
    const [all, setAll] = useState(false);
    const ordered = orderRows(rows);
    const next = ordered.find((row) => !row.done) ?? null;
    const shown = all ? ordered : next ? [next] : [];

    return (
        <section
            aria-labelledby={headingId}
            data-setup-checklist={name}
            data-state="line"
            className={cn(
                "grid justify-items-start gap-3 rounded-xl border border-border bg-card px-4 py-3.5",
                className,
            )}
        >
            <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-1.5">
                <h2
                    id={headingId}
                    data-ph-unmask=""
                    className="text-[14.5px] font-semibold"
                >
                    {title}
                </h2>
                <span className="text-[12.5px] tabular-nums text-muted-foreground">
                    {count}
                </span>
                <ProgressBar
                    value={done}
                    max={total}
                    label={count}
                    className="min-w-20 flex-1"
                />
                {hide ? <HideForNow hide={hide} /> : null}
            </div>
            <ul
                id={listId}
                className={cn(
                    "grid w-full gap-1",
                    // The next step alone sits in its own tinted band.
                    !all &&
                        "rounded-[10px] border border-border bg-muted/40 px-3 py-1.5",
                )}
            >
                {shown.map((row) => (
                    <ChecklistStep key={row.key} row={row} />
                ))}
            </ul>
            {done > 0 ? (
                <TextLink
                    tone="muted"
                    aria-expanded={all}
                    aria-controls={listId}
                    onClick={() => setAll((open) => !open)}
                    className="text-[12.5px] coarse:min-h-11"
                >
                    {all
                        ? "Show fewer"
                        : `Show the ${countOf(done, "done step")}`}
                </TextLink>
            ) : null}
            {children}
        </section>
    );
}

"use client";

import { chipClass } from "@saroh/ui/chip";
import { cn } from "@saroh/ui/lib/utils";
import { ChevronRight } from "lucide-react";

import { DAYS } from "@/lib/staff/day-plan";
import type { WeekRow } from "@/lib/staff/hours-view";

export type { WeekRow } from "@/lib/staff/hours-view";

/** Which days "Change several days" opens with. */
export type SeveralStart = "weekdays" | "weekend" | "choose";

const ROW =
    "flex w-full items-center gap-2.5 border-b border-border bg-card py-2 pl-4 pr-3 text-left text-foreground last:border-b-0 min-h-14 min-[760px]:min-h-[58px] min-[760px]:gap-4 min-[760px]:px-[18px]";

/**
 * The week as a calm list (U17, BKMAvailability "hours set", BKDHours):
 * one row a day, the day's name on the left, its hours on the right with
 * lunch or a second shift under them on a phone and beside them at a
 * desk. A row opens that day's sheet, where it changes and saves with
 * Undo; the row of the day being changed is marked while its panel is
 * open at a desk. Over the list, three chips open "Change several days"
 * with the weekdays, the weekend, or no day picked yet. Without the
 * right to change hours the rows only read.
 */
export function WeeklyHours({
    rows,
    canEdit,
    showChips,
    selected = null,
    whose,
    onOpenDay,
    onSeveral,
}: {
    rows: WeekRow[];
    canEdit: boolean;
    /** The chips are for one person's week, not everyone's. */
    showChips: boolean;
    /** The day whose panel is open, marked at a desk. */
    selected?: number | null;
    /** Whose week the rows are, for each row's name to a screen reader. */
    whose: string;
    onOpenDay: (day: number) => void;
    onSeveral: (start: SeveralStart) => void;
}) {
    const chips =
        canEdit && showChips ? (
            <div
                role="group"
                aria-label="Change several days at once"
                className="flex basis-full gap-1.5 min-[760px]:basis-auto"
            >
                {(
                    [
                        ["weekdays", "Mon to Fri"],
                        ["weekend", "Sat and Sun"],
                        ["choose", "Choose days"],
                    ] as const
                ).map(([start, label]) => (
                    <button
                        key={start}
                        type="button"
                        onClick={() => onSeveral(start)}
                        className={chipClass(
                            false,
                            "h-11 flex-1 justify-center px-2 min-[760px]:h-8 min-[760px]:flex-none min-[760px]:px-3",
                        )}
                    >
                        {label}
                    </button>
                ))}
            </div>
        ) : null;

    return (
        <section aria-labelledby="weekly-hours" className="min-w-0">
            <div className="mb-2.5 mt-[26px] flex flex-wrap items-center gap-x-2 gap-y-2.5 min-[760px]:mt-0">
                <h2
                    id="weekly-hours"
                    className="flex-1 font-display text-[16px] font-semibold tracking-[-0.01em] min-[760px]:text-[17px] min-[760px]:tracking-[-0.02em]"
                >
                    Weekly hours
                </h2>
                {chips}
            </div>
            <ul className="overflow-hidden rounded-[14px] border border-border bg-card min-[760px]:rounded-[12px]">
                {rows.map((r) => {
                    const name = DAYS.find((d) => d.day === r.day)?.name ?? "";
                    const closed = r.main === "Closed";
                    const body = (
                        <>
                            <span className="min-w-0 flex-1 text-[15.5px] font-medium min-[760px]:w-[140px] min-[760px]:flex-none min-[760px]:text-[14.5px] min-[760px]:font-semibold">
                                {name}
                            </span>
                            <span className="whitespace-nowrap text-right text-[14.5px] tabular-nums leading-[1.35] min-[760px]:flex min-[760px]:flex-1 min-[760px]:items-baseline min-[760px]:gap-4 min-[760px]:text-left">
                                <span
                                    className={cn(
                                        "text-muted-foreground min-[760px]:text-foreground",
                                        closed &&
                                            "min-[760px]:text-muted-foreground",
                                    )}
                                >
                                    {r.main}
                                </span>
                                {r.sub ? (
                                    <span className="block text-[12px] text-muted-foreground min-[760px]:ml-auto min-[760px]:text-[12.5px]">
                                        {r.sub}
                                    </span>
                                ) : null}
                            </span>
                        </>
                    );
                    return (
                        <li
                            key={r.day}
                            className="border-b border-border last:border-b-0"
                        >
                            {canEdit ? (
                                <button
                                    type="button"
                                    aria-haspopup="dialog"
                                    aria-label={`${name}, ${r.main}${r.sub ? `, ${r.sub}` : ""}. Change ${whose}`}
                                    onClick={() => onOpenDay(r.day)}
                                    data-selected={
                                        selected === r.day ? "" : undefined
                                    }
                                    className={cn(
                                        ROW,
                                        "cursor-pointer border-b-0 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring active:bg-accent-active",
                                        "min-[760px]:data-[selected]:bg-muted min-[760px]:data-[selected]:shadow-[inset_3px_0_0_hsl(var(--foreground))]",
                                    )}
                                >
                                    {body}
                                    <ChevronRight
                                        aria-hidden
                                        className="size-4 shrink-0 text-muted-foreground"
                                    />
                                </button>
                            ) : (
                                <div className={cn(ROW, "border-b-0")}>
                                    {body}
                                </div>
                            )}
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}

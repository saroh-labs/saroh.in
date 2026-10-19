"use client";

import { cn } from "@saroh/ui/lib/utils";
import { ChevronRight } from "lucide-react";

import { firstName } from "@/lib/names";
import { dayName, daySummary, rangesOn } from "@/lib/staff/day-plan";
import type { WeeklyRange } from "@/lib/staff/types";

import { Face } from "./face";

/**
 * Everyone's day (BKMAvailability "everyone's Monday"): who works it and
 * when, one row a person; a row opens that person's day.
 */
export function EveryoneDay({
    day,
    people,
    canEdit,
    onPick,
}: {
    day: number;
    people: { id: string; name: string; hours: WeeklyRange[] }[];
    canEdit: boolean;
    onPick: (staffId: string) => void;
}) {
    return (
        <ul className="overflow-hidden rounded-[14px] border border-border bg-card">
            {people.map((p) => {
                const s = daySummary(rangesOn(p.hours, day));
                const body = (
                    <>
                        <Face name={p.name} />
                        <span className="min-w-0 flex-1">
                            <span className="block text-[14.5px] font-semibold">
                                {p.name}
                            </span>
                            <span className="mt-0.5 block text-[12.5px] text-muted-foreground">
                                {s.sub ? `${s.main} · ${s.sub}` : s.main}
                            </span>
                        </span>
                    </>
                );
                const row =
                    "flex min-h-[60px] w-full items-center gap-3 bg-card py-2 pl-3.5 pr-3 text-left";
                return (
                    <li
                        key={p.id}
                        className="border-b border-border last:border-b-0"
                    >
                        {canEdit ? (
                            <button
                                type="button"
                                onClick={() => onPick(p.id)}
                                aria-label={`${p.name}: ${s.main}. Change ${firstName(p.name)}'s ${dayName(day)}`}
                                className={cn(
                                    row,
                                    "cursor-pointer hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                                )}
                            >
                                {body}
                                <ChevronRight
                                    aria-hidden
                                    className="size-4 text-muted-foreground"
                                />
                            </button>
                        ) : (
                            <div className={row}>{body}</div>
                        )}
                    </li>
                );
            })}
        </ul>
    );
}

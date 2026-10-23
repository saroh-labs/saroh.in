"use client";

import { Button } from "@saroh/ui/button";
import { Chip } from "@saroh/ui/chip";
import { useId, useState } from "react";

import { DAYS, moreDays } from "@/lib/staff/day-plan";

import { PanelLabel } from "./hours-panel";

/** A day as a circle in a picker of days: its letter, its name to a reader. */
export const CIRCLE =
    "size-11 justify-center rounded-full px-0 text-[14px] font-semibold";

/**
 * "Also use these hours on" (U17, DEC-170 Q8): the week as seven circles,
 * this day marked and fixed; tick others and "Use on 2 more days" gives
 * them this day's hours, replacing theirs, in one save with Undo.
 */
export function AlsoUse({
    day,
    onUse,
}: {
    day: number;
    /** Save it; answers whether it saved. */
    onUse: (days: number[]) => Promise<boolean>;
}) {
    const id = useId();
    const [copy, setCopy] = useState<number[]>([]);
    return (
        <>
            <PanelLabel id={`${id}-also`}>Also use these hours on</PanelLabel>
            <div
                role="group"
                aria-labelledby={`${id}-also`}
                className="mt-2 flex justify-between gap-1"
            >
                {DAYS.map((d) => {
                    const current = d.day === day;
                    return (
                        <Chip
                            key={d.day}
                            as="toggle"
                            on={current || copy.includes(d.day)}
                            disabled={current}
                            aria-label={
                                current ? `${d.name}, this day` : d.name
                            }
                            className={CIRCLE}
                            onClick={() =>
                                setCopy((c) =>
                                    c.includes(d.day)
                                        ? c.filter((x) => x !== d.day)
                                        : [...c, d.day],
                                )
                            }
                        >
                            {d.letter}
                        </Chip>
                    );
                })}
            </div>
            {copy.length ? (
                <Button
                    type="button"
                    variant="outline"
                    className="mt-2.5 h-12 w-full"
                    onClick={async () => {
                        if (await onUse(copy)) setCopy([]);
                    }}
                >
                    Use on {moreDays(copy.length)}
                </Button>
            ) : null}
        </>
    );
}

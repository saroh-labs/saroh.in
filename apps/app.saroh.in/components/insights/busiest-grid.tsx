"use client";

import { cn } from "@saroh/ui/lib/utils";
import { ListTable, listTable } from "@saroh/ui/list-table";
import { TextLink } from "@saroh/ui/text-link";
import { useId, useState } from "react";

import { formatNumber } from "@/lib/format/money";
import type { SellsRead } from "@/lib/insights/reads";
import type { BusyLevel } from "@/lib/insights/sells-words";
import {
    busyView,
    DAY_PARTS,
    WEEKDAYS,
    WEEKDAYS_SHORT,
} from "@/lib/insights/sells-words";

import { AnswerCard, AnswerText } from "./answer-card";

/**
 * "When is it busiest?" (DEC-171, plan U13, #1095; `IBSellsD`, `IBSellsP`):
 * the week as a grid, a column per weekday and a row per part of the day,
 * each cell as dark as it was busy (Saffron, quieter to busier), and the
 * legend. "Show as a table" puts the same numbers in a table, a row per
 * day, for anyone who would rather read them or can't tell the shades
 * apart; "Show as a grid" brings the grid back.
 *
 * The grid is a picture: the sentence above says what it shows, and the
 * table is how its numbers are read. Too young or too few, the sentence
 * says what it needs and nothing is drawn (`IBSellsEmptyD`).
 */

const SHADE: Record<BusyLevel, string> = {
    0: "bg-muted",
    1: "bg-brand-100",
    2: "bg-brand-200",
    3: "bg-brand-400",
    4: "bg-brand-600",
    5: "bg-brand-800",
};

const LEVELS: BusyLevel[] = [1, 2, 3, 4, 5];

export function BusiestGrid({ read }: { read: SellsRead }) {
    const view = busyView(read);
    const [table, setTable] = useState(false);
    const id = useId();
    return (
        <AnswerCard question="When is it busiest?" data-testid="sells-busiest">
            <AnswerText answer={view.answer} />
            {view.enough ? (
                <>
                    <div id={id} className="w-full" data-ph-mask="">
                        {table ? (
                            <BusyTable rows={view.rows} />
                        ) : (
                            <div
                                role="img"
                                aria-label={`Sales and bookings by day and time. ${view.answer}`}
                                data-testid="busy-grid"
                                className="grid w-full grid-cols-[52px_repeat(7,minmax(0,1fr))] gap-[3px] text-[11.5px] desk:grid-cols-[64px_repeat(7,minmax(0,1fr))] desk:gap-1"
                            >
                                <span aria-hidden />
                                {WEEKDAYS_SHORT.map((day) => (
                                    <span
                                        key={day}
                                        aria-hidden
                                        data-ph-unmask=""
                                        className="text-center font-medium text-muted-foreground"
                                    >
                                        {day}
                                    </span>
                                ))}
                                {view.rows.map((cells, part) => (
                                    <Row
                                        key={DAY_PARTS[part]}
                                        part={part}
                                        cells={cells}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-neutral-700 dark:text-muted-foreground">
                        {table ? null : (
                            <span
                                aria-hidden
                                data-ph-unmask=""
                                className="inline-flex items-center gap-1.5"
                            >
                                Quieter
                                {LEVELS.map((level) => (
                                    <span
                                        key={level}
                                        className={cn(
                                            "inline-block h-3 w-4 rounded-[3px]",
                                            SHADE[level],
                                        )}
                                    />
                                ))}
                                Busier
                                <span>·</span>
                            </span>
                        )}
                        <TextLink
                            onClick={() => setTable((on) => !on)}
                            aria-controls={id}
                            aria-expanded={table}
                            className="inline-flex min-h-9 items-center text-[13px] font-semibold coarse:min-h-11"
                        >
                            {table ? "Show as a grid" : "Show as a table"}
                        </TextLink>
                    </div>
                    {view.outside ? (
                        <p
                            data-ph-mask=""
                            className="text-xs leading-[1.5] text-muted-foreground"
                        >
                            {view.outside}
                        </p>
                    ) : null}
                </>
            ) : null}
        </AnswerCard>
    );
}

function Row({
    part,
    cells,
}: {
    part: number;
    cells: ReturnType<typeof busyView>["rows"][number];
}) {
    return (
        <>
            <span
                aria-hidden
                data-ph-unmask=""
                className="self-center whitespace-nowrap text-muted-foreground"
            >
                {DAY_PARTS[part]}
            </span>
            {cells.map((cell) => (
                <span
                    key={cell.key}
                    aria-hidden
                    data-level={cell.level}
                    className={cn("h-[30px] rounded-[5px]", SHADE[cell.level])}
                />
            ))}
        </>
    );
}

/** The grid's numbers: a row per weekday, a column per part of the day. */
function BusyTable({ rows }: { rows: ReturnType<typeof busyView>["rows"] }) {
    const cell = "max-desk:px-2";
    return (
        <ListTable className="w-full">
            <table className="w-full text-[13px]" data-testid="busy-table">
                <caption className="sr-only">
                    Sales and bookings, each day and time
                </caption>
                <thead>
                    <tr className={listTable.headRow}>
                        <th scope="col" className={cn(listTable.th, cell)}>
                            Day
                        </th>
                        {DAY_PARTS.map((part) => (
                            <th
                                key={part}
                                scope="col"
                                className={cn(
                                    listTable.th,
                                    listTable.numeric,
                                    cell,
                                )}
                            >
                                {part}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {WEEKDAYS.map((day, d) => (
                        <tr key={day} className={listTable.tr}>
                            <th
                                scope="row"
                                className={cn(
                                    listTable.td,
                                    cell,
                                    "text-left font-medium",
                                )}
                            >
                                <span aria-hidden>{WEEKDAYS_SHORT[d]}</span>
                                <span className="sr-only">{day}</span>
                            </th>
                            {rows.map((parts, p) => (
                                <td
                                    key={p}
                                    className={cn(
                                        listTable.td,
                                        listTable.numeric,
                                        cell,
                                    )}
                                >
                                    {formatNumber(parts[d].total)}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </ListTable>
    );
}

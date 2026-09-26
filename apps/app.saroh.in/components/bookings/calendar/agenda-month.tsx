"use client";

import { cn } from "@saroh/ui/lib/utils";

import type { Block, LocalDate } from "@/lib/services/diary";
import { blockLine, blockTitle, clock, monthDays } from "@/lib/services/diary";

import { StatePill } from "./parts";

export interface FreeRow {
    key: string;
    who: string;
    from: number;
    to: number;
    book: () => void;
}

/** One row of the agenda: the time, a bar in the kind's colour, who and what. */
export function AgendaList({
    blocks,
    selected,
    onBlock,
    empty,
}: {
    blocks: Block[];
    selected: string | null;
    onBlock: (block: Block) => void;
    empty: string;
}) {
    if (blocks.length === 0) {
        return (
            <p className="rounded-[11px] border border-dashed border-border px-3.5 py-5 text-[13px] text-muted-foreground">
                {empty}
            </p>
        );
    }
    return (
        <ul className="flex flex-col gap-2">
            {blocks.map((b) => (
                <li key={b.key}>
                    <button
                        type="button"
                        onClick={() => onBlock(b)}
                        className={cn(
                            "flex w-full items-center gap-3 rounded-[11px] border bg-card px-3.5 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                            selected === b.key
                                ? "border-foreground"
                                : "border-border hover:border-border-strong",
                            b.state === "cancelled" && "text-muted-foreground",
                        )}
                    >
                        <div className="w-16 shrink-0 tabular-nums">
                            <div className="text-[14px] font-bold">
                                {clock(b.start)}
                            </div>
                            <div className="text-[11.5px] text-muted-foreground">
                                {clock(b.end)}
                            </div>
                        </div>
                        <span
                            aria-hidden
                            className={cn(
                                "w-1 shrink-0 self-stretch rounded-sm",
                                b.state === "cancelled"
                                    ? "bg-border-strong"
                                    : b.kind === "class"
                                      ? "bg-diary-class"
                                      : "bg-diary-one",
                            )}
                        />
                        <div className="min-w-0 flex-1">
                            <div
                                className={cn(
                                    "text-[14px] font-semibold",
                                    b.state === "cancelled" && "line-through",
                                )}
                            >
                                {blockTitle(b)}
                            </div>
                            <div className="mt-0.5 text-[12px] text-muted-foreground">
                                {blockLine(b)}
                            </div>
                        </div>
                        <StatePill state={b.state} />
                    </button>
                </li>
            ))}
        </ul>
    );
}

/**
 * Layout 3c: the month to pick a day from (a dot where something is
 * booked), the free gaps of the day to book straight into, and the day as a
 * list — the layout a phone gets.
 */
export function AgendaMonth({
    date,
    today,
    busyDays,
    free,
    onDay,
    children,
}: {
    date: LocalDate;
    today: LocalDate;
    /** Days of the month with something booked. */
    busyDays: ReadonlySet<LocalDate>;
    free: FreeRow[] | null;
    onDay: (date: LocalDate) => void;
    children: React.ReactNode;
}) {
    const { days, lead } = monthDays(date);
    return (
        <div className="flex flex-wrap items-start gap-4">
            <div className="min-w-0 flex-[0_1_260px] rounded-[12px] border border-border bg-card p-3 max-[759px]:flex-[1_1_100%]">
                <div
                    role="group"
                    aria-label="Pick a day"
                    className="grid grid-cols-7 gap-[3px] text-center"
                >
                    {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
                        <span
                            key={i}
                            aria-hidden
                            className="py-[3px] text-[11px] text-muted-foreground"
                        >
                            {d}
                        </span>
                    ))}
                    {Array.from({ length: lead }, (_, i) => (
                        <span key={`lead${i}`} aria-hidden />
                    ))}
                    {days.map((d) => {
                        const on = d === date;
                        const busy = busyDays.has(d);
                        return (
                            <button
                                key={d}
                                type="button"
                                onClick={() => onDay(d)}
                                aria-pressed={on}
                                aria-label={`${Number(d.slice(8))}${busy ? ", has bookings" : ""}${d === today ? ", today" : ""}`}
                                className={cn(
                                    "h-[34px] rounded-[8px] text-[12.5px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                                    on
                                        ? "bg-primary font-bold text-primary-foreground"
                                        : d === today
                                          ? "bg-brand-subtle font-medium"
                                          : "font-medium hover:bg-muted",
                                )}
                            >
                                {Number(d.slice(8))}
                                <span
                                    aria-hidden
                                    className={cn(
                                        "mx-auto mt-px block size-1 rounded-full",
                                        busy
                                            ? "bg-highlight"
                                            : "bg-transparent",
                                    )}
                                />
                            </button>
                        );
                    })}
                </div>
                {free ? (
                    <div className="mt-2.5 border-t border-border/60 pt-2.5">
                        <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                            {date === today ? "Free today" : "Free this day"}
                        </div>
                        {free.length === 0 ? (
                            <p className="px-2 py-1.5 text-[12.5px] text-muted-foreground">
                                Nobody has free time.
                            </p>
                        ) : (
                            free.map((f) => (
                                <button
                                    key={f.key}
                                    type="button"
                                    onClick={f.book}
                                    aria-label={`Book ${f.who} at ${clock(f.from)}`}
                                    className="flex w-full gap-2 rounded-[7px] px-2 py-[7px] text-left text-[12.5px] hover:bg-success-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                    <span className="flex-1">{f.who}</span>
                                    <span className="font-semibold tabular-nums text-success-subtle-foreground">
                                        {clock(f.from)}–{clock(f.to)}
                                    </span>
                                </button>
                            ))
                        )}
                    </div>
                ) : null}
            </div>
            <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-2">
                {children}
            </div>
        </div>
    );
}

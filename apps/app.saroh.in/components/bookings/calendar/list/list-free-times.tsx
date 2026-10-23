"use client";

import { formatClock, formatClockRange } from "@/lib/format/datetime";
import { count } from "@/lib/format/plural";
import { cn } from "@saroh/ui/lib/utils";
import { ChevronDown, Plus } from "lucide-react";
import { useId, useState } from "react";

import { callName } from "@/lib/services/call-name";
import { freeTally } from "@/lib/services/diary-list";

const PHONE_HEAD =
    "flex min-h-[52px] w-full items-center gap-2.5 px-3.5 text-left text-success-subtle-foreground min-[760px]:hidden";

export interface FreeRow {
    key: string;
    who: string;
    from: number;
    to: number;
    /** Opens the free-time sheet (book, or block it); null for someone who can't book. */
    book: (() => void) | null;
}

/**
 * The List's free times (U6): on a phone a green card that opens to one
 * 48px row per free time ("Meera Iyer · 12:15 to 1:00 pm +"); on the desk a
 * right-hand column, always open, each row "12:15 to 1:00 pm · Meera Iyer ·
 * + Book". A row opens the free-time sheet, where the time is booked or
 * blocked. Someone who sees the calendar only reads the times, with
 * nothing to press.
 */
export function ListFreeTimes({
    rows,
    today,
    person,
    canBook,
    className,
}: {
    rows: readonly FreeRow[];
    today: boolean;
    /** The one person shown, or null for everyone. */
    person: string | null;
    canBook: boolean;
    className?: string;
}) {
    const [open, setOpen] = useState(false);
    const listId = useId();
    const n = rows.length;
    const some = n > 0;
    const nm = person ? callName(person) : null;

    const phoneLabel = some
        ? `${count(n, "free time")} ${today ? "today" : "this day"}`
        : "No free times this day";
    const phoneSub = some
        ? `${nm ?? freeTally(rows)}${canBook ? " · tap to book one" : ""}`
        : "Nobody has free time";
    const deskSub = !some
        ? "Nobody has free time this day."
        : canBook
          ? nm
              ? `Click one to book ${nm} or block it.`
              : "Click one to book someone or block it. Each says who is free."
          : "Each says who is free.";

    const phoneHead = (
        <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-semibold">
                {phoneLabel}
            </span>
            <span className="block text-[12px] opacity-85">{phoneSub}</span>
        </span>
    );

    return (
        <section
            aria-label="Free times"
            data-list-free=""
            className={cn(
                "overflow-hidden rounded-[12px] border border-success-subtle-foreground/20 bg-success-subtle min-[760px]:border-border min-[760px]:bg-card min-[760px]:pb-1.5 min-[760px]:pt-1",
                className,
            )}
        >
            {/* A phone: a card that opens, when there is anything in it. */}
            {some ? (
                <button
                    type="button"
                    aria-expanded={open}
                    aria-controls={listId}
                    onClick={() => setOpen((o) => !o)}
                    className={cn(
                        PHONE_HEAD,
                        "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                    )}
                >
                    {phoneHead}
                    <ChevronDown
                        aria-hidden
                        className={cn(
                            "size-[18px] shrink-0 transition-transform duration-fast",
                            open && "rotate-180",
                        )}
                    />
                </button>
            ) : (
                <div className={PHONE_HEAD}>{phoneHead}</div>
            )}
            {/* The desk: a column with a heading. */}
            <div className="px-4 pb-1.5 pt-3 max-[759px]:hidden">
                <h2 className="m-0 font-display text-[16px] font-semibold tracking-[-0.02em]">
                    {some ? count(n, "free time") : "No free times"}
                </h2>
                <p className="mt-0.5 text-[12.5px] leading-normal text-muted-foreground">
                    {deskSub}
                </p>
            </div>
            {some ? (
                <ul
                    id={listId}
                    className={cn(
                        "m-0 list-none border-t border-success-subtle-foreground/20 bg-card p-0 min-[760px]:border-t-0",
                        !open && "max-[759px]:hidden",
                    )}
                >
                    {rows.map((f) => (
                        <li
                            key={f.key}
                            className="border-b border-success-subtle-foreground/15 last:border-b-0 min-[760px]:border-border/50"
                        >
                            <FreeTimeRow row={f} />
                        </li>
                    ))}
                </ul>
            ) : null}
        </section>
    );
}

function FreeTimeRow({ row }: { row: FreeRow }) {
    const range = formatClockRange(row.from, row.to);
    const inner = (
        <>
            {/* The desk: a dot, the time over who, and "+ Book". */}
            <span
                aria-hidden
                className="size-2 shrink-0 rounded-full bg-success max-[759px]:hidden"
            />
            <span className="min-w-0 flex-1 max-[759px]:hidden">
                <span className="block text-[13.5px] font-semibold tabular-nums text-success-subtle-foreground">
                    {range}
                </span>
                <span className="block text-[12px] text-muted-foreground">
                    {row.who}
                </span>
            </span>
            {/* A phone: who, then the time. */}
            <span className="min-w-0 flex-1 truncate font-medium text-foreground min-[760px]:hidden">
                {row.who}
            </span>
            <span className="whitespace-nowrap tabular-nums min-[760px]:hidden">
                {range}
            </span>
            {row.book ? (
                <span className="inline-flex items-center gap-[3px] text-[12.5px] font-semibold">
                    <Plus
                        aria-hidden
                        className="size-4 min-[760px]:size-[13px]"
                    />
                    <span className="max-[759px]:hidden">Book</span>
                </span>
            ) : null}
        </>
    );
    const shape =
        "flex w-full items-center gap-2.5 px-3 text-left text-[13.5px] font-semibold text-success-subtle-foreground min-h-12 min-[760px]:min-h-[46px] min-[760px]:px-4 min-[760px]:py-2";
    return row.book ? (
        <button
            type="button"
            onClick={row.book}
            aria-label={`Book ${row.who} at ${formatClock(row.from)}, free ${range}`}
            className={cn(
                shape,
                "cursor-pointer hover:bg-success-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring active:brightness-95",
            )}
        >
            {inner}
        </button>
    ) : (
        <div data-free-still="" className={shape}>
            {inner}
        </div>
    );
}

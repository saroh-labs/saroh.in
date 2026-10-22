"use client";

import { cn } from "@saroh/ui/lib/utils";
import { ChevronRight, Plus, Store } from "lucide-react";

import type { LocalDate } from "@/lib/services/diary";
import { spanWords } from "@/lib/staff/day-plan";
import type { OffItem } from "@/lib/staff/hours-view";
import type { TimeOffInput } from "@/lib/staff/service";
import type { OffLine } from "@/lib/staff/time-off";
import { offDates, offRowWords } from "@/lib/staff/time-off";

import { Face } from "@/components/bookings/availability/face";
import { ADD_TIME_OFF_ID } from "./add-time-off-sheet";

const ROW =
    "flex min-h-[60px] w-full items-center gap-3 bg-card py-2 pl-3.5 pr-3 text-left text-foreground min-[760px]:min-h-[58px] min-[760px]:px-[18px]";
const PRESS =
    "cursor-pointer hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring active:bg-accent-active";

/**
 * Time off on Hours and time off (U17, BKMAvailability, BKDHours): what is
 * coming up, one row each — whose and when on top, why, what part of the
 * day and how long under it; the business closed has its shop sign — and
 * "Add time off" as the list's last row. A row opens the time off on its
 * own, where it can be removed with Undo. Read-only roles see the rows.
 */
export function TimeOffCard({
    items,
    today,
    canEdit,
    onOpen,
    onAdd,
}: {
    items: OffItem[];
    today: LocalDate;
    canEdit: boolean;
    onOpen: (item: OffItem) => void;
    onAdd: () => void;
}) {
    return (
        <section aria-labelledby="time-off" className="min-w-0">
            <div className="mb-2.5 mt-[26px] flex items-baseline gap-2 min-[760px]:mt-0">
                <h2
                    id="time-off"
                    className="flex-1 font-display text-[16px] font-semibold tracking-[-0.01em] min-[760px]:text-[17px] min-[760px]:tracking-[-0.02em]"
                >
                    Time off
                </h2>
                <span className="text-[12.5px] text-muted-foreground">
                    Coming up
                </span>
            </div>
            <ul className="overflow-hidden rounded-[14px] border border-border bg-card min-[760px]:rounded-[12px]">
                {items.map((item) => {
                    const words = offRowWords(item.line, item.who, today);
                    const body = (
                        <>
                            {item.staffId ? (
                                <Face name={item.who ?? ""} />
                            ) : (
                                <Face
                                    tone="amber"
                                    icon={
                                        <Store
                                            aria-hidden
                                            className="size-[17px]"
                                        />
                                    }
                                />
                            )}
                            <span className="min-w-0 flex-1">
                                <span className="block text-[14.5px] font-semibold">
                                    {words.title}
                                </span>
                                <span className="mt-0.5 block text-[12.5px] text-muted-foreground">
                                    {words.sub}
                                </span>
                            </span>
                        </>
                    );
                    return (
                        <li
                            key={item.line.ids[0]}
                            className="border-b border-border last:border-b-0"
                        >
                            {canEdit ? (
                                <button
                                    type="button"
                                    aria-haspopup="dialog"
                                    aria-label={`${words.title}, ${words.sub}`}
                                    onClick={() => onOpen(item)}
                                    className={cn(ROW, PRESS)}
                                >
                                    {body}
                                    <ChevronRight
                                        aria-hidden
                                        className="size-4 shrink-0 text-muted-foreground"
                                    />
                                </button>
                            ) : (
                                <div className={ROW}>{body}</div>
                            )}
                        </li>
                    );
                })}
                {!items.length ? (
                    <li className="border-b border-border px-3.5 py-3.5 last:border-b-0">
                        <span className="block text-[14px] font-semibold">
                            No time off coming up
                        </span>
                        <span className="mt-0.5 block text-[12.5px] text-muted-foreground">
                            Leave, holidays and closed days show here.
                        </span>
                    </li>
                ) : null}
                {canEdit ? (
                    <li>
                        <button
                            id={ADD_TIME_OFF_ID}
                            type="button"
                            aria-haspopup="dialog"
                            onClick={onAdd}
                            className={cn(
                                ROW,
                                PRESS,
                                "min-h-[52px] text-[14.5px] font-semibold min-[760px]:min-h-[58px]",
                            )}
                        >
                            <Face
                                icon={
                                    <Plus aria-hidden className="size-[18px]" />
                                }
                            />
                            Add time off
                        </button>
                    </li>
                ) : null}
            </ul>
        </section>
    );
}

/**
 * One line of time off, opened from the list: what it is, and "Remove
 * this time off" at its foot. Time off is added and removed, not edited:
 * to change one, remove it (Undo puts it back) and add it again.
 */
export function OffDetails({
    item,
    today,
}: {
    item: OffItem;
    today: LocalDate;
}) {
    const { line } = item;
    const facts: [string, string][] = [
        ["What", line.closed ? "The business is closed" : "Someone is away"],
        ...(line.closed ? [] : [["Who", item.who ?? ""] as [string, string]]),
        ["When", offDates(line.fromDate, line.toDate, today)],
        [
            "Hours",
            line.startMinute === null || line.endMinute === null
                ? "All day"
                : spanWords(line.startMinute, line.endMinute),
        ],
        ["Reason", line.reason?.trim() ? line.reason.trim() : "None given"],
    ];
    return (
        <dl className="mt-1 overflow-hidden rounded-[12px] border border-border bg-card">
            {facts.map(([k, v]) => (
                <div
                    key={k}
                    className="flex min-h-[52px] items-center gap-3 border-b border-border px-3.5 text-[15px] last:border-b-0"
                >
                    <dt className="flex-1">{k}</dt>
                    <dd className="text-right text-muted-foreground">{v}</dd>
                </div>
            ))}
        </dl>
    );
}

/** A removed line as the API takes it back, for Undo. */
export function rangeOfLine(line: OffLine): TimeOffInput {
    const row = line.rows.at(0);
    if (!line.closed && !line.allDay && line.rows.length === 1 && row) {
        return {
            startAt: row.startAt,
            endAt: row.endAt,
            reason: row.reason ?? undefined,
        };
    }
    return {
        fromDate: line.fromDate,
        toDate: line.toDate,
        ...(line.startMinute !== null && line.endMinute !== null
            ? { startMinute: line.startMinute, endMinute: line.endMinute }
            : {}),
        reason: line.reason ?? undefined,
    };
}

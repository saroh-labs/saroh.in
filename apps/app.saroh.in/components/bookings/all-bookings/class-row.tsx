"use client";

import { cn } from "@saroh/ui/lib/utils";
import { listTable } from "@saroh/ui/list-table";
import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

import { LineBar, LineTime } from "@/components/bookings/calendar/booking-line";
import { StatusBadge } from "@/components/shared/lists/status-badge";
import { formatTime } from "@/lib/format/datetime";
import { firstName } from "@/lib/names";
import { lengthWord } from "@/lib/services/all-bookings";
import type { DiaryBooking } from "@/lib/services/booking-calendar";

import { ROW_GRID } from "./booking-row";

/**
 * A class start on the List as one row (DEC-260): "Yoga flow · 7 of 15",
 * who teaches it and how many places are left. Pressing it opens its
 * people under it, each the List's own row with its menu and its
 * Came / Didn't come.
 */
export function ClassRow({
    bookings,
    zone,
    showMoney,
    children,
}: {
    /** Everyone on it in this list, cancelled included. */
    bookings: readonly DiaryBooking[];
    zone: string;
    showMoney: boolean;
    /** Its people, as rows: drawn while it is open. */
    children: ReactNode;
}) {
    const [open, setOpen] = useState(false);
    const first = bookings.at(0);
    if (!first) return null;
    const live = bookings.filter((b) => b.status !== "CANCELLED").length;
    const capacity = first.service.capacity;
    const left = capacity - live;
    const title = `${first.service.name} · ${live} of ${capacity}`;
    const status =
        live === 0
            ? { label: "Cancelled", tone: "neutral" as const }
            : left <= 0
              ? { label: "Full", tone: "error" as const }
              : {
                    label: `${left} ${left === 1 ? "place" : "places"} left`,
                    tone: "success" as const,
                };
    const teacher = first.staff
        ? `Class with ${firstName(first.staff.name)}`
        : "Class";

    return (
        <>
            <li
                data-class-row={`${first.serviceId}@${first.startAt}`}
                className={cn(
                    listTable.rule,
                    listTable.wash,
                    ROW_GRID(showMoney),
                    "relative gap-y-1 px-[14px] py-[11px] max-[759px]:grid-cols-[64px_4px_minmax(0,1fr)_44px]",
                )}
            >
                <LineTime
                    time={formatTime(first.startAt, zone)}
                    length={lengthWord(first.startAt, first.endAt)}
                    className={listTable.time}
                />
                <LineBar kind="class" className="min-[760px]:hidden" />
                <span className="min-w-0 min-[760px]:contents">
                    <button
                        type="button"
                        aria-expanded={open}
                        onClick={() => setOpen((o) => !o)}
                        className="block w-full truncate rounded-sm text-left text-[14.5px] font-semibold text-foreground after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-[760px]:text-[14px]"
                    >
                        {title}
                    </button>
                    <span className="block truncate text-[12.5px] text-muted-foreground min-[760px]:text-[13.5px]">
                        {teacher}
                    </span>
                    <span className="mt-1 block min-[760px]:hidden">
                        <StatusBadge tone={status.tone}>
                            {status.label}
                        </StatusBadge>
                    </span>
                </span>
                {showMoney ? <span className="max-[759px]:hidden" /> : null}
                <span className="max-[759px]:hidden">
                    <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                </span>
                <span className="flex justify-end">
                    <ChevronDown
                        aria-hidden
                        className={cn(
                            "size-[18px] text-muted-foreground transition-transform duration-fast",
                            open && "rotate-180",
                        )}
                    />
                </span>
            </li>
            {open ? (
                <li className="border-b border-border bg-muted/30 last:border-b-0 min-[760px]:pl-[110px]">
                    <ul aria-label={`Who is on ${first.service.name}`}>
                        {children}
                    </ul>
                </li>
            ) : null}
        </>
    );
}

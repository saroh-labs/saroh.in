"use client";

import { cn } from "@saroh/ui/lib/utils";
import { listTable } from "@saroh/ui/list-table";
import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

import { LineBar, LineTime } from "@/components/bookings/calendar/booking-line";
import type { StatusTone } from "@/components/shared/lists/status-badge";
import { StatusBadge } from "@/components/shared/lists/status-badge";
import { formatTime } from "@/lib/format/datetime";
import { formatMoney } from "@/lib/format/money";
import { firstName } from "@/lib/names";
import { lengthWord } from "@/lib/services/all-bookings";
import type { DiaryBooking } from "@/lib/services/booking-calendar";
import { hasEnded } from "@/lib/services/booking-state";
import { classClose, classCloseWords } from "@/lib/services/session-counts";

import { ROW_GRID } from "./booking-row";

/**
 * A class start on the List as one row (DEC-260): "Yoga flow · 7 of 15",
 * who teaches it and how many places are left — or, once it has finished,
 * how it went: "8 came · 1 didn't · 3 to pay" (DEC-274), with what was
 * taken and what is still to take in Money. Pressing it opens its people
 * under it, each the List's own row with its menu, its Came / Didn't come
 * and its Awaiting payment.
 */
export function ClassRow({
    bookings,
    zone,
    showMoney,
    now,
    children,
}: {
    /** Everyone on it in this list, cancelled included. */
    bookings: readonly DiaryBooking[];
    zone: string;
    showMoney: boolean;
    /** The list's clock: a finished class says how it went. */
    now: number;
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
    // Finished (and not all cancelled): how it went, not places left.
    const closed =
        live > 0 && hasEnded(first, now)
            ? classCloseWords(classClose(bookings))
            : null;
    const badges = closed ?? [status];
    const money = showMoney && closed ? classMoney(bookings) : null;
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
                    "relative gap-y-1 px-[14px] py-[11px]",
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
                    <span className="mt-1 flex flex-wrap items-center gap-1.5 min-[760px]:hidden">
                        <Badges badges={badges} />
                        {money ? (
                            <span className="text-[12.5px] tabular-nums text-muted-foreground">
                                {money}
                            </span>
                        ) : null}
                    </span>
                </span>
                {showMoney ? (
                    <span
                        className="min-w-0 text-[13.5px] tabular-nums max-[759px]:hidden"
                        data-money=""
                    >
                        {money}
                    </span>
                ) : null}
                <span className="flex flex-wrap items-center gap-1.5 max-[759px]:hidden">
                    <Badges badges={badges} />
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

function Badges({
    badges,
}: {
    badges: readonly {
        label: string;
        tone: StatusTone;
    }[];
}) {
    return badges.map((b) => (
        <StatusBadge key={b.label} tone={b.tone}>
            {b.label}
        </StatusBadge>
    ));
}

/**
 * A finished class's money: "₹3,600 taken · ₹1,350 to take", from each
 * place's one answer (DEC-272). Null when nothing was or is to be paid.
 */
export function classMoney(bookings: readonly DiaryBooking[]): string | null {
    const live = bookings.filter((b) => b.status !== "CANCELLED");
    const currency = live.find((b) => b.service.currency)?.service.currency;
    const taken = live.reduce((n, b) => n + (b.pay?.paidCents ?? 0), 0);
    const due = live.reduce(
        (n, b) =>
            n +
            (b.pay?.word === "AWAITING_PAYMENT" ? (b.pay.dueCents ?? 0) : 0),
        0,
    );
    const parts = [
        taken > 0 ? `${formatMoney(taken, currency ?? null)} taken` : null,
        due > 0 ? `${formatMoney(due, currency ?? null)} to take` : null,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(" · ") : null;
}

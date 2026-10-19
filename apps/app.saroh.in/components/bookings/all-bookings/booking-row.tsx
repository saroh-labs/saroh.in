"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { listTable } from "@saroh/ui/list-table";
import { Check, X } from "lucide-react";
import Link from "next/link";

import { StatusBadge } from "@/components/shared/status-badge";
import { formatTime } from "@/lib/format/datetime";
import type { RowStatus } from "@/lib/services/all-bookings";
import { ROW_STATUS } from "@/lib/services/all-bookings";
import type { DiaryBooking } from "@/lib/services/booking-calendar";
import type { BookingOutcome } from "@/lib/services/booking-state";
import { BOOKING_WORDS, outcomeWord } from "@/lib/services/booking-words";
import { whoFor } from "@/lib/services/diary";

import type { RowMenuItems } from "./row-menu";
import { RowMenu } from "./row-menu";

/**
 * The columns at a desk (BKDAllBookings): When, Customer, Service · with,
 * Did they come?, Status, and the ⋯. On a phone (BKMAllBookings) the same
 * row is a card line: the time, who and what, the badge and the ⋯, with
 * "Did they come?" on a line of its own under it.
 */
export const ROW_GRID =
    "grid grid-cols-[68px_minmax(0,1fr)_auto_auto] items-center gap-x-3 min-[760px]:grid-cols-[110px_minmax(0,1fr)_minmax(0,1.2fr)_220px_150px_44px]";

const OUTCOME_CHIP =
    "relative z-[1] inline-flex h-[30px] cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-card px-3 text-[13px] font-medium transition-colors duration-fast hover:border-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:bg-accent-active disabled:cursor-default disabled:text-disabled-foreground max-[759px]:h-11 max-[759px]:px-3.5 max-[759px]:text-[13.5px] [&_svg]:size-3.5";

/**
 * One booking on All bookings (U11). The name opens the booking (the whole
 * row does, through the name's link); the ⋯ opens its menu; a booking that
 * has ended unmarked asks "Did they come?" with Came and Didn't come right
 * there, and once one is pressed it says so with Undo beside it for the
 * ten seconds it is held.
 */
export function BookingRow({
    booking: b,
    zone,
    status,
    asks,
    marked,
    onMark,
    onUndo,
    canMark,
    menu,
    when,
    heading,
    triggerRef,
}: {
    booking: DiaryBooking;
    /** The business's zone (Q10). */
    zone: string;
    status: RowStatus;
    /** Ended, unmarked: "Did they come?". */
    asks: boolean;
    /** What was just pressed, while it is shown before the list reads again. */
    marked: { outcome: BookingOutcome; undo: (() => void) | null } | null;
    onMark: (outcome: BookingOutcome) => void;
    onUndo: () => void;
    /** `booking:write`: the two buttons; without it the question is only said. */
    canMark: boolean;
    menu: RowMenuItems;
    /** "Today, 11:30 am · Physio assessment with Meera". */
    when: string;
    /** "Kabir Singh · today, 11:30 am". */
    heading: string;
    triggerRef?: (el: HTMLButtonElement | null) => void;
}) {
    const who = whoFor(b);
    const what = b.staff
        ? `${b.service.name} · ${b.staff.name}`
        : b.service.name;
    const shownStatus: RowStatus = marked
        ? marked.outcome === "ATTENDED"
            ? "came"
            : "didnt"
        : status;
    const badge = ROW_STATUS[shownStatus];

    const outcome = marked ? (
        <span className="flex items-center gap-2 text-[12.5px] text-muted-foreground max-[759px]:min-h-11">
            <span>{outcomeWord(marked.outcome)}</span>
            {marked.undo ? (
                <Button
                    type="button"
                    variant="link"
                    size="inline"
                    onClick={onUndo}
                    className="relative z-[1] max-[759px]:min-h-11"
                >
                    Undo
                </Button>
            ) : null}
        </span>
    ) : asks ? (
        <span
            role="group"
            aria-label={`Did ${who} come?`}
            className="flex flex-wrap items-center gap-1.5"
        >
            <span className="mr-auto text-[12.5px] text-muted-foreground min-[760px]:sr-only">
                Did they come?
            </span>
            {canMark ? (
                <>
                    <button
                        type="button"
                        onClick={() => onMark("ATTENDED")}
                        className={cn(
                            OUTCOME_CHIP,
                            "text-success-subtle-foreground",
                        )}
                    >
                        <Check aria-hidden />
                        {BOOKING_WORDS.came}
                    </button>
                    <button
                        type="button"
                        onClick={() => onMark("NO_SHOW")}
                        className={cn(
                            OUTCOME_CHIP,
                            "text-destructive-subtle-foreground",
                        )}
                    >
                        <X aria-hidden />
                        {BOOKING_WORDS.didntCome}
                    </button>
                </>
            ) : (
                <span className="text-[12.5px] text-muted-foreground">
                    {BOOKING_WORDS.notMarked}
                </span>
            )}
        </span>
    ) : b.outcome ? (
        <span className="text-[12.5px] text-muted-foreground">
            {outcomeWord(b.outcome)}
        </span>
    ) : null;

    return (
        <li
            data-booking-row={b.id}
            className={cn(
                listTable.rule,
                listTable.wash,
                ROW_GRID,
                "relative gap-y-2 px-[14px] py-[11px] focus-within:bg-foreground/[0.035]",
            )}
        >
            <span className={cn(listTable.time, "text-[13.5px]")}>
                <span className="block font-semibold">
                    {formatTime(b.startAt, zone)}
                </span>
                <span className="block text-[12px] text-muted-foreground">
                    <span className="max-[759px]:hidden">to </span>
                    {formatTime(b.endAt, zone)}
                </span>
            </span>
            <span className="min-w-0 min-[760px]:contents">
                <Link
                    href={`/bookings/${b.id}`}
                    data-ph-mask=""
                    className="block truncate rounded-sm text-[14.5px] font-semibold text-foreground after:absolute after:inset-0 after:content-[''] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-[760px]:text-[14px]"
                >
                    {who}
                </Link>
                <span className="block truncate text-[12.5px] text-muted-foreground min-[760px]:text-[13.5px]">
                    {what}
                </span>
            </span>
            <span
                className={cn(
                    "min-w-0 max-[759px]:order-5 max-[759px]:col-span-full",
                    // On a phone the badge says how it went: the line under
                    // the row is only for the question.
                    !asks && !marked && "max-[759px]:hidden",
                )}
            >
                {outcome}
            </span>
            <span className="max-[759px]:order-3">
                <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
            </span>
            <span className="flex justify-end max-[759px]:order-4">
                <RowMenu
                    who={who}
                    when={when}
                    heading={heading}
                    items={menu}
                    triggerRef={triggerRef}
                />
            </span>
        </li>
    );
}

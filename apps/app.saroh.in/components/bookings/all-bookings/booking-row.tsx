"use client";

import { AbsentValue } from "@saroh/ui/absent-value";
import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { listTable } from "@saroh/ui/list-table";
import { Check, X } from "lucide-react";

import { LineBar, LineTime } from "@/components/bookings/calendar/booking-line";
import { StatusBadge } from "@/components/shared/lists/status-badge";
import { formatTime } from "@/lib/format/datetime";
import { firstName } from "@/lib/names";
import type { RowStatus } from "@/lib/services/all-bookings";
import {
    cancelledLine,
    lengthWord,
    moneyCell,
    ROW_STATUS,
} from "@/lib/services/all-bookings";
import type { DiaryBooking } from "@/lib/services/booking-calendar";
import type { BookingOutcome } from "@/lib/services/booking-state";
import { BOOKING_WORDS } from "@/lib/services/booking-words";
import { whoFor } from "@/lib/services/diary";

import type { RowMenuItems } from "./row-menu";
import { RowMenu } from "./row-menu";

/**
 * The columns at a desk (BLHB): When, Customer, Service · with, Money (for
 * those who read money), Status, and the ⋯. Status holds the badge, or
 * Came and Didn't come once the visit has ended unmarked. On a phone the
 * same row is a card line: the time, who and what, the badge and the ⋯,
 * with the money and the question on lines of their own under it.
 */
export const ROW_GRID = (money: boolean) =>
    cn(
        // A phone's line (BKVListBPhone): time, bar, who and what, "…".
        "grid grid-cols-[64px_4px_minmax(0,1fr)_44px] items-center gap-x-2.5 min-[760px]:gap-x-3",
        money
            ? "min-[760px]:grid-cols-[110px_minmax(0,1fr)_minmax(0,1.2fr)_150px_230px_44px]"
            : "min-[760px]:grid-cols-[110px_minmax(0,1fr)_minmax(0,1.2fr)_230px_44px]",
    );

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
    showMoney,
    onOpen,
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
    /** `payment:read`: the Money column (owners and admins, DEC-098). */
    showMoney: boolean;
    /** The row's press: its quick look, as on the Calendar. */
    onOpen: () => void;
}) {
    const who = whoFor(b);
    const what = b.staff
        ? `${b.service.name} · ${firstName(b.staff.name)}`
        : b.service.name;
    const shownStatus: RowStatus = marked
        ? marked.outcome === "ATTENDED"
            ? "came"
            : "didnt"
        : status;
    const badge = ROW_STATUS[shownStatus];

    const money = showMoney ? moneyCell(b) : null;
    const moneyWords = money
        ? [money.amount, money.note].filter(Boolean).join(" · ")
        : "";

    // Status: the badge, or the question once the visit has ended unmarked.
    const outcome = marked ? (
        <span className="flex items-center gap-2 text-[12.5px] text-muted-foreground max-[759px]:min-h-11">
            <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
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
            <span
                data-ph-unmask=""
                className="mr-auto text-[12.5px] text-muted-foreground min-[760px]:sr-only"
            >
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
                <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
            )}
        </span>
    ) : (
        <span className="grid justify-items-start gap-0.5">
            <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
            {shownStatus === "cancelled" ? (
                <span className="text-[12px] text-muted-foreground">
                    {cancelledLine(b, zone).replace("Cancelled · ", "")}
                </span>
            ) : null}
        </span>
    );
    // On a phone the question has its own line under the row; otherwise
    // the badge stays on the row.
    const lineBelow = asks || Boolean(marked);

    return (
        <li
            data-booking-row={b.id}
            className={cn(
                listTable.rule,
                listTable.wash,
                ROW_GRID(showMoney),
                shownStatus === "cancelled" && "opacity-70",
                "relative gap-y-2 px-[14px] py-[11px] focus-within:bg-foreground/[0.035]",
            )}
        >
            <LineTime
                time={formatTime(b.startAt, zone)}
                length={lengthWord(b.startAt, b.endAt)}
                className={cn(listTable.time, "self-start")}
            />
            <LineBar
                kind={b.service.capacity > 1 ? "class" : "one"}
                muted={shownStatus === "cancelled" || shownStatus === "didnt"}
                className="max-[759px]:row-span-2 min-[760px]:hidden"
            />
            <span className="min-w-0 min-[760px]:contents">
                <button
                    type="button"
                    onClick={onOpen}
                    aria-haspopup="dialog"
                    data-ph-mask=""
                    className="block w-full cursor-pointer rounded-sm text-left text-[14.5px] font-semibold leading-snug text-foreground after:absolute after:inset-0 after:content-[''] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-[759px]:break-words min-[760px]:truncate min-[760px]:text-[14px]"
                >
                    {who}
                </button>
                <span className="block truncate text-[12.5px] text-muted-foreground min-[760px]:text-[13.5px]">
                    {what}
                </span>
            </span>
            {money ? (
                <span
                    className="hidden min-w-0 text-[13.5px] tabular-nums min-[760px]:block"
                    data-money=""
                >
                    {money.note || money.amount ? (
                        <>
                            <span className="block font-medium">
                                {money.amount ?? <AbsentValue />}
                            </span>
                            {money.note ? (
                                <span className="block text-[12px] text-muted-foreground">
                                    {money.note}
                                </span>
                            ) : null}
                        </>
                    ) : (
                        <AbsentValue />
                    )}
                </span>
            ) : null}
            <span
                className={cn(
                    "min-w-0",
                    lineBelow
                        ? "max-[759px]:col-span-full max-[759px]:row-start-3"
                        : "max-[759px]:col-start-3 max-[759px]:row-start-2 max-[759px]:flex max-[759px]:flex-wrap max-[759px]:items-center max-[759px]:gap-x-2",
                )}
            >
                {outcome}
                {moneyWords && !lineBelow ? (
                    <span
                        data-money-line=""
                        className="text-[12.5px] tabular-nums text-muted-foreground min-[760px]:hidden"
                    >
                        {moneyWords}
                    </span>
                ) : null}
            </span>
            <span className="flex justify-end self-start max-[759px]:col-start-4 max-[759px]:row-start-1">
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

"use client";

import { cn } from "@saroh/ui/lib/utils";
import type { ReactNode } from "react";

import { StatusBadge } from "@/components/shared/lists/status-badge";
import { formatClock } from "@/lib/format/datetime";
import { firstName } from "@/lib/names";
import { minutesWord } from "@/lib/services/all-bookings";
import type { Block } from "@/lib/services/diary";
import { blockTitle, isLive, liveSeats } from "@/lib/services/diary";
import { blockStatus } from "@/lib/services/diary-view";

import { STATE_TONE } from "./parts";

/**
 * One booking as a line, the same in Day's Agenda, the phone's Week and
 * the List (BKVListBPhone, BKVCalendarBPhone): the time over its length,
 * a bar in the kind's colour, who in bold over what and with whom, how it
 * stands under that, and the "…" where the row has a menu. The whole line
 * opens the quick look. The pieces are exported so the List's table row
 * draws its phone line from the same parts.
 */

/** The time column: "11:00 am" over "45 min". */
export function LineTime({
    time,
    length,
    className,
}: {
    time: string;
    length: string;
    className?: string;
}) {
    return (
        <span
            className={cn(
                "w-16 shrink-0 whitespace-nowrap tabular-nums",
                className,
            )}
        >
            <span className="block text-[14px] font-semibold">{time}</span>
            <span className="block text-[12px] text-muted-foreground">
                {length}
            </span>
        </span>
    );
}

/** The bar in the kind's colour: a class, a one-to-one, or stepped back. */
export function LineBar({
    kind,
    muted = false,
    className,
}: {
    kind: "one" | "class";
    /** Cancelled or didn't come: grey. */
    muted?: boolean;
    className?: string;
}) {
    return (
        <span
            aria-hidden
            data-line-bar={muted ? "muted" : kind}
            className={cn(
                "w-1 shrink-0 self-stretch rounded-sm",
                muted
                    ? "bg-border-strong"
                    : kind === "class"
                      ? "bg-diary-class"
                      : "bg-diary-one",
                className,
            )}
        />
    );
}

/** "Warehouse walkthrough · Meera", or a class's "7 of 15 · Neha". */
export function blockWhat(b: Block): string {
    const staff = b.kind === "class" ? b.session.staff : b.booking.staff;
    const what =
        b.kind === "class"
            ? `${liveSeats(b.session).length} of ${b.session.capacity}`
            : b.booking.service.name;
    return staff ? `${what} · ${firstName(staff.name)}` : what;
}

/** A diary block as one line: its time, bar, who, what and status. */
export function BlockLine({
    block: b,
    selected,
    onOpen,
    badge,
}: {
    block: Block;
    selected: boolean;
    onOpen: () => void;
    /** In place of the status word: Agenda's "Next". */
    badge?: ReactNode;
}) {
    const cancelled = !isLive(b);
    const status = blockStatus(b);
    return (
        <button
            type="button"
            onClick={onOpen}
            aria-current={selected ? "true" : undefined}
            data-booking-line={b.key}
            className={cn(
                "flex min-h-[60px] w-full cursor-pointer items-stretch gap-2.5 px-3 py-2.5 text-left transition-colors duration-fast hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring active:bg-muted",
                selected && "shadow-[inset_3px_0_0_hsl(var(--foreground))]",
                cancelled && "text-muted-foreground",
            )}
        >
            <LineTime
                time={formatClock(b.start)}
                length={minutesWord(b.end - b.start)}
            />
            <LineBar kind={b.kind} muted={cancelled || b.state === "noshow"} />
            <span className="min-w-0 flex-1">
                <span
                    data-ph-mask=""
                    className={cn(
                        "block text-[14.5px] font-semibold leading-snug",
                        cancelled && "line-through",
                    )}
                >
                    {blockTitle(b)}
                </span>
                <span className="block text-[12.5px] text-muted-foreground">
                    {blockWhat(b)}
                </span>
                <span className="mt-1 block">
                    {badge ?? (
                        <StatusBadge tone={STATE_TONE[status.state]}>
                            {status.label}
                        </StatusBadge>
                    )}
                </span>
            </span>
        </button>
    );
}

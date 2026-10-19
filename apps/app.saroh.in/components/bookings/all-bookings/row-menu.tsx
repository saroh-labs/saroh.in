"use client";

import { Button } from "@saroh/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@saroh/ui/dropdown-menu";
import { cn } from "@saroh/ui/lib/utils";
import {
    Ban,
    CalendarClock,
    FileText,
    IndianRupee,
    MoreHorizontal,
    UserCheck,
    UserRound,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useState } from "react";

import { HeaderOverlay } from "@/components/bookings/calendar/header/header-overlay";
import { usePhone } from "@/components/bookings/calendar/header/use-phone";
import type { RowAction } from "@/lib/services/all-bookings";
import { BOOKING_WORDS } from "@/lib/services/booking-words";

/** What each of a row's menu items says and does. */
export interface RowMenuItems {
    /** In the boards' order; Cancel last. */
    actions: readonly RowAction[];
    /** "Take ₹400". */
    takeLabel: string | null;
    /** "Open Kabir's page". */
    personLabel: string;
    openHref: string;
    personHref: string | null;
    /** Cancelling is held (ten seconds with Undo): Cancel waits. */
    cancelling: boolean;
    onArrived: () => void;
    onTake: () => void;
    onMove: () => void;
    onCancel: () => void;
}

const ICONS: Record<RowAction, ReactNode> = {
    arrived: <UserCheck aria-hidden />,
    take: <IndianRupee aria-hidden />,
    move: <CalendarClock aria-hidden />,
    open: <FileText aria-hidden />,
    person: <UserRound aria-hidden />,
    cancel: <Ban aria-hidden />,
};

function label(action: RowAction, items: RowMenuItems): string {
    switch (action) {
        case "arrived":
            return BOOKING_WORDS.markArrived;
        case "take":
            return items.takeLabel ?? "Take payment";
        case "move":
            return "Move to another time";
        case "open":
            return "Open the booking";
        case "person":
            return items.personLabel;
        case "cancel":
            return items.cancelling ? "Cancelling…" : "Cancel booking";
    }
}

const PHONE_ROW =
    "flex min-h-[52px] w-full cursor-pointer items-center gap-3.5 border-b border-border px-1 text-left text-[15px] font-medium text-foreground last:border-b-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring active:bg-accent-active disabled:cursor-default disabled:text-disabled-foreground [&_svg]:size-5 [&_svg]:shrink-0 [&_svg]:text-foreground/80";

/**
 * A row's menu on All bookings (BKMAllBookings, BKDAllBookings): Mark
 * arrived, Take ₹X, Move to another time, Open the booking, Open {first}'s
 * page, and Cancel booking last, in red, apart. A sheet from the foot of
 * a phone, titled with who and when; a menu under the row's ⋯ at a desk.
 * What the booking or the viewer can't do isn't in it (`rowMenu`).
 */
export function RowMenu({
    who,
    when,
    heading,
    items,
    triggerRef,
}: {
    who: string;
    /** Under the phone sheet's title: "Today, 11:30 am · Physio assessment with Meera". */
    when: string;
    /** Over the desk menu: "Kabir Singh · today, 11:30 am". */
    heading: string;
    items: RowMenuItems;
    /** The ⋯ button, so a sheet opened from the menu gives focus back. */
    triggerRef?: (el: HTMLButtonElement | null) => void;
}) {
    const phone = usePhone();
    const [open, setOpen] = useState(false);
    const trigger = (
        <Button
            ref={triggerRef}
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`More for ${who}`}
            data-row-menu=""
            className="relative z-[1] size-9 shrink-0 text-muted-foreground hover:text-foreground max-[759px]:size-11"
        >
            <MoreHorizontal aria-hidden className="size-[18px]" />
        </Button>
    );
    const top = items.actions.filter((a) => a !== "cancel");
    const cancel = items.actions.includes("cancel");

    if (phone) {
        // The menu's sheet closes first, handing focus back to the ⋯;
        // what it opens (the cancel or move sheet) then takes it, and
        // gives it back there when it closes.
        const run = (fn: () => void) => () => {
            setOpen(false);
            window.setTimeout(fn, 0);
        };
        const row = (action: RowAction): ReactNode => {
            const text = (
                <>
                    {ICONS[action]}
                    <span className="flex-1">{label(action, items)}</span>
                </>
            );
            if (action === "open" || action === "person") {
                const href =
                    action === "open" ? items.openHref : items.personHref;
                return href ? (
                    <Link
                        key={action}
                        href={href}
                        className={PHONE_ROW}
                        onClick={() => setOpen(false)}
                    >
                        {text}
                    </Link>
                ) : null;
            }
            const fn =
                action === "arrived"
                    ? items.onArrived
                    : action === "take"
                      ? items.onTake
                      : action === "move"
                        ? items.onMove
                        : items.onCancel;
            return (
                <button
                    key={action}
                    type="button"
                    disabled={action === "cancel" && items.cancelling}
                    onClick={run(fn)}
                    className={cn(
                        PHONE_ROW,
                        action === "cancel" &&
                            "text-destructive-subtle-foreground [&_svg]:text-destructive-subtle-foreground",
                    )}
                >
                    {text}
                </button>
            );
        };
        return (
            <HeaderOverlay
                open={open}
                onOpenChange={setOpen}
                trigger={trigger}
                title={who}
                subtitle={when}
                width={260}
            >
                <div data-row-sheet="" className="pb-3">
                    {top.map(row)}
                    {cancel ? row("cancel") : null}
                </div>
            </HeaderOverlay>
        );
    }

    const item = (action: RowAction): ReactNode => {
        const text = (
            <>
                {ICONS[action]}
                {label(action, items)}
            </>
        );
        if (action === "open" || action === "person") {
            const href = action === "open" ? items.openHref : items.personHref;
            return href ? (
                <DropdownMenuItem
                    key={action}
                    asChild
                    className="cursor-pointer"
                >
                    <Link href={href}>{text}</Link>
                </DropdownMenuItem>
            ) : null;
        }
        const fn =
            action === "arrived"
                ? items.onArrived
                : action === "take"
                  ? items.onTake
                  : action === "move"
                    ? items.onMove
                    : items.onCancel;
        return (
            <DropdownMenuItem
                key={action}
                className="cursor-pointer"
                variant={action === "cancel" ? "destructive" : "default"}
                disabled={action === "cancel" && items.cancelling}
                onSelect={fn}
            >
                {text}
            </DropdownMenuItem>
        );
    };

    return (
        <DropdownMenu open={open} onOpenChange={setOpen}>
            <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[260px] p-1.5">
                <DropdownMenuLabel className="label px-2.5 py-1.5">
                    {heading}
                </DropdownMenuLabel>
                {top.map(item)}
                {cancel ? (
                    <>
                        <DropdownMenuSeparator />
                        {item("cancel")}
                    </>
                ) : null}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

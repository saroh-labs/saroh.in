"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import {
    ArrowRight,
    ArrowRightLeft,
    CalendarPlus,
    ChevronDown,
    CircleCheck,
    CircleX,
    IndianRupee,
    MoreHorizontal,
    Pencil,
    Rows3,
    Undo2,
    User,
    UserRoundCog,
    XCircle,
} from "lucide-react";
import Link from "next/link";
import type { ReactElement, ReactNode } from "react";
import { useState } from "react";

import { HeaderOverlay } from "./header/header-overlay";
import { QL_BTN } from "./quick-look-parts";

/** One row of More: something to do, or somewhere to go. */
export interface MoreRow {
    key: string;
    label: string;
    icon: MoreIcon;
    danger?: boolean;
    href?: string;
    onSelect?: () => void;
}

export type MoreIcon =
    | "take"
    | "noshow"
    | "came"
    | "undo"
    | "person"
    | "full"
    | "next"
    | "move"
    | "cancel"
    | "edit"
    | "day"
    | "who";

const ICONS: Record<MoreIcon, ReactNode> = {
    take: <IndianRupee aria-hidden className="size-[18px]" />,
    noshow: <CircleX aria-hidden className="size-[18px]" />,
    came: <CircleCheck aria-hidden className="size-[18px]" />,
    undo: <Undo2 aria-hidden className="size-[18px]" />,
    person: <User aria-hidden className="size-[18px]" />,
    full: <ArrowRight aria-hidden className="size-[18px]" />,
    next: <CalendarPlus aria-hidden className="size-[18px]" />,
    move: <ArrowRightLeft aria-hidden className="size-[18px]" />,
    cancel: <XCircle aria-hidden className="size-[18px]" />,
    edit: <Pencil aria-hidden className="size-[18px]" />,
    day: <Rows3 aria-hidden className="size-[18px]" />,
    who: <UserRoundCog aria-hidden className="size-[18px]" />,
};

const ROW =
    "flex min-h-[52px] w-full cursor-pointer items-center gap-3.5 border-b border-border/60 px-1 text-left text-[15px] font-medium text-foreground last:border-b-0 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring min-[760px]:min-h-[42px] min-[760px]:gap-3 min-[760px]:rounded-[8px] min-[760px]:border-b-0 min-[760px]:px-2.5 min-[760px]:text-[14px]";

/**
 * "More" (BKMQuickLook's sheet, BKDQuickLook's menu): everything that is
 * not the one main action, Cancel last and in red. A sheet from the foot
 * of a phone, a menu over the button at a desk; choosing a row closes it
 * and does the thing, so nothing is left half done behind it.
 */
export function QuickLookMore({
    title,
    rows,
    className,
    trigger,
}: {
    /** "Kabir's booking", "Mat Pilates, 6:00 pm". */
    title: string;
    rows: readonly MoreRow[];
    className?: string;
    /**
     * A button of the screen's own to open it (a booking's page puts "…"
     * in its top row on a phone); left out, the "More" button.
     */
    trigger?: ReactElement;
}) {
    const [open, setOpen] = useState(false);
    if (rows.length === 0) return null;
    return (
        <HeaderOverlay
            open={open}
            onOpenChange={setOpen}
            title={title}
            width={300}
            align="end"
            trigger={
                trigger ?? (
                    <Button
                        type="button"
                        variant="outline"
                        className={cn(QL_BTN, "gap-2", className)}
                    >
                        <MoreHorizontal
                            aria-hidden
                            className="size-[18px] min-[760px]:hidden"
                        />
                        More
                        <ChevronDown
                            aria-hidden
                            className="hidden size-4 min-[760px]:block"
                        />
                    </Button>
                )
            }
        >
            <ul className="-mx-1 pb-3 min-[760px]:mx-[-10px] min-[760px]:pb-0">
                {rows.map((row) => {
                    const look = cn(
                        ROW,
                        row.danger && "text-destructive hover:text-destructive",
                    );
                    const inner = (
                        <>
                            <span
                                className={cn(
                                    "flex w-6 justify-center text-muted-foreground min-[760px]:w-5",
                                    row.danger && "text-destructive",
                                )}
                            >
                                {ICONS[row.icon]}
                            </span>
                            <span className="flex-1">{row.label}</span>
                        </>
                    );
                    return (
                        <li key={row.key}>
                            {row.href ? (
                                <Link
                                    href={row.href}
                                    className={look}
                                    onClick={() => setOpen(false)}
                                >
                                    {inner}
                                </Link>
                            ) : (
                                <button
                                    type="button"
                                    className={look}
                                    onClick={() => {
                                        setOpen(false);
                                        row.onSelect?.();
                                    }}
                                >
                                    {inner}
                                </button>
                            )}
                        </li>
                    );
                })}
            </ul>
        </HeaderOverlay>
    );
}

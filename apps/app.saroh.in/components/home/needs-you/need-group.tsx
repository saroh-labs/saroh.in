"use client";

import { Badge } from "@saroh/ui/badge";
import { IconButton } from "@saroh/ui/icon-button";
import { cn } from "@saroh/ui/lib/utils";
import type { LucideIcon } from "lucide-react";
import {
    CalendarClock,
    ChevronDown,
    CreditCard,
    FileText,
    MessageSquare,
    Package,
    Settings2,
    Star,
    Warehouse,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useId } from "react";

import type { GroupLine } from "@/lib/home/group-words";
import type { HomeNeedKind } from "@/lib/home/service";

import { TONE_BADGE } from "./tone";

/** One glyph per kind, as the Home A boards draw them. */
export const GROUP_ICONS: Record<HomeNeedKind, LucideIcon> = {
    ORDERS: Package,
    BILLS: FileText,
    AWAITING_PAYMENT: CalendarClock,
    ENQUIRIES: MessageSquare,
    PAYMENTS: CreditCard,
    REVIEWS: Star,
    STOCK: Warehouse,
    SETUP: Settings2,
};

/**
 * One group of Needs you on Home A (DEC-171, plan U6, board `HAPageD`):
 * its icon, one line saying what it holds ("7 orders to send or hand
 * over"), the line under it, a tag for what is late, its action, and a
 * disclosure that opens its rows in place.
 *
 * The line is a link to the list the group stands for. What opens inside
 * (`children`) is the group's body: its rows and their inline actions,
 * which U7 builds (`need-group-body.tsx`), hosted here on the desk and in
 * a sheet on the phone (U17). `actions` is the group's own buttons
 * beside the tag ("Open orders", "See bills"; Remind all is U8's).
 */
export function NeedGroup({
    kind,
    line,
    href,
    open,
    onToggle,
    actions,
    children,
}: {
    kind: HomeNeedKind;
    line: GroupLine;
    href: string;
    open: boolean;
    onToggle: () => void;
    actions?: ReactNode;
    /** The rows, drawn only while open. */
    children?: ReactNode;
}) {
    const bodyId = useId();
    const Icon = GROUP_ICONS[kind];
    return (
        <li
            data-need-group={kind}
            data-state={open ? "open" : "closed"}
            className="border-t border-border first:border-t-0"
        >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3 pl-3.5 pr-2.5">
                <span
                    aria-hidden
                    className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-muted text-neutral-700 dark:text-muted-foreground"
                >
                    <Icon className="size-[18px]" />
                </span>
                <Link
                    href={href}
                    className="grid min-w-0 flex-[1_1_240px] gap-0.5 rounded text-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 coarse:min-h-11"
                >
                    <span className="text-[14.5px] font-semibold [overflow-wrap:anywhere]">
                        {line.title}
                    </span>
                    {line.sub ? (
                        <span className="text-pretty text-[12.5px] leading-[1.4] text-muted-foreground">
                            {line.sub}
                        </span>
                    ) : null}
                </Link>
                <span className="ml-auto flex flex-wrap items-center justify-end gap-2">
                    {line.tag ? (
                        <Badge variant={TONE_BADGE[line.tag.tone]} size="sm">
                            {line.tag.label}
                        </Badge>
                    ) : null}
                    {actions}
                    <IconButton
                        label={open ? "Hide the rows" : "Show the rows"}
                        tooltip={false}
                        aria-expanded={open}
                        aria-controls={bodyId}
                        onClick={onToggle}
                        icon={
                            <ChevronDown
                                className={cn(
                                    "transition-transform duration-base",
                                    open && "rotate-180",
                                )}
                            />
                        }
                        className="text-muted-foreground"
                    />
                </span>
            </div>
            <div id={bodyId} hidden={!open}>
                {open ? children : null}
            </div>
        </li>
    );
}

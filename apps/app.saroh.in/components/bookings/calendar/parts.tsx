import { Badge } from "@saroh/ui/badge";
import { cn } from "@saroh/ui/lib/utils";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

import type { DiaryState } from "@/lib/services/diary";
import { STATE_LABEL } from "@/lib/services/diary";

/**
 * Small pieces the Bookings screens share (the "Saroh Bookings" design):
 * the crumb strip above each screen, the state pill and the choice chip.
 */

/** The Bookings screens draw their own crumb strip edge to edge. */
export const BARE = "space-y-0 px-0 pb-0 pt-0 sm:px-0";

/** "Bookings › Calendar", with whatever the screen puts on the right. */
export function BookingsTopBar({
    page,
    children,
}: {
    page: string;
    children?: ReactNode;
}) {
    return (
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-3.5 py-[9px]">
            <nav
                aria-label="Breadcrumb"
                className="flex items-center gap-2 text-[12px]"
            >
                <span className="text-muted-foreground">Bookings</span>
                <svg
                    aria-hidden
                    viewBox="0 0 24 24"
                    className="size-3 shrink-0 text-muted-foreground"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                >
                    <path d="M9.5 5 L16.5 12 L9.5 19" />
                </svg>
                <span className="text-foreground" aria-current="page">
                    {page}
                </span>
            </nav>
            {children}
        </div>
    );
}

const PILL: Record<
    DiaryState,
    ComponentPropsWithoutRef<typeof Badge>["variant"]
> = {
    booked: "draft",
    pending: "draft",
    in: "success",
    noshow: "error",
    cancelled: "neutral",
    open: "success",
    full: "error",
};

/** A booking's state as a filled pill: always the word, the hue only helps. */
export function StatePill({
    state,
    label,
    tone,
    className,
}: {
    state?: DiaryState;
    /** Overrides the state's word ("Late cancel", "Credit back"). */
    label?: string;
    tone?: ComponentPropsWithoutRef<typeof Badge>["variant"];
    className?: string;
}) {
    return (
        <Badge
            variant={tone ?? (state ? PILL[state] : "neutral")}
            className={cn(
                "shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.04em]",
                className,
            )}
        >
            {label ?? (state ? STATE_LABEL[state] : "")}
        </Badge>
    );
}

/** A choice among a few — a radio drawn as a pill (the design's chip). */
export function Chip({
    on,
    className,
    ...props
}: ComponentPropsWithoutRef<"button"> & { on: boolean }) {
    return (
        <button
            type="button"
            role="radio"
            aria-checked={on}
            className={cn(
                "h-8 whitespace-nowrap rounded-full border px-3 text-[12.5px] transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:border-border disabled:bg-disabled disabled:text-disabled-foreground coarse:h-11",
                on
                    ? "border-foreground bg-primary font-semibold text-primary-foreground"
                    : "border-border bg-card font-medium text-foreground hover:border-border-strong",
                className,
            )}
            {...props}
        />
    );
}

/** The small uppercase label over a group of chips. */
export function Eyebrow({
    children,
    className,
    id,
}: {
    children: ReactNode;
    className?: string;
    id?: string;
}) {
    return (
        <div
            id={id}
            className={cn(
                "mb-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground",
                className,
            )}
        >
            {children}
        </div>
    );
}

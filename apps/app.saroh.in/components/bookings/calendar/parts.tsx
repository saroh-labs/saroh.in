import { Badge } from "@saroh/ui/badge";
import { cn } from "@saroh/ui/lib/utils";
import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

import type { DiaryState } from "@/lib/services/diary";
import { STATE_LABEL } from "@/lib/services/diary";

/**
 * Small pieces the Bookings screens share (the "Saroh Bookings" design):
 * the crumb strip above each screen, the state pill and the choice chip.
 */

/** The Bookings screens draw their own crumb strip edge to edge. */
export const BARE = "space-y-0 px-0 pb-0 pt-0 sm:px-0";

/**
 * "Bookings › Calendar", with whatever the screen puts on the right. Without
 * a page it is just "Bookings" (the locked card, drawn for every route).
 */
export function BookingsTopBar({
    page,
    children,
}: {
    page?: string;
    children?: ReactNode;
}) {
    return (
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-3.5 py-[9px]">
            <nav
                aria-label="Breadcrumb"
                className="flex items-center gap-2 text-[12px]"
            >
                {page ? (
                    <span className="text-muted-foreground">Bookings</span>
                ) : (
                    <span className="text-foreground" aria-current="page">
                        Bookings
                    </span>
                )}
                {page ? (
                    <>
                        <Chevron />
                        <span className="text-foreground" aria-current="page">
                            {page}
                        </span>
                    </>
                ) : null}
            </nav>
            {children}
        </div>
    );
}

function Chevron() {
    return (
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
    );
}

/**
 * Bookings, locked for a role that can't read them (E5, the design's locked
 * state): a card that says why and who can change it — not an error, and no
 * retry, because trying again does the same thing.
 */
export function BookingsLocked({
    role,
    roleLabel,
}: {
    role: string;
    /** What the role is called on screen, for a role the business made. */
    roleLabel: string | null;
}) {
    const text =
        role === "REVIEWER"
            ? "Your role is Reviewer, which can see the website but not bookings. An owner or admin can change that in Team."
            : `Your role${roleLabel ? ` is ${roleLabel}, which` : ""} doesn't include bookings. An owner or admin can change that in Team.`;
    return (
        <div className="px-[22px] py-[60px] max-[759px]:px-4" role="note">
            <div className="flex flex-col items-center gap-[9px] rounded-[12px] border border-dashed border-border-strong px-6 py-9 text-center">
                <svg
                    aria-hidden
                    viewBox="0 0 24 24"
                    className="size-7 text-muted-foreground"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.8}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                >
                    <path d="M6 11 H18 V20 H6 Z M8.5 11 V8 A3.5 3.5 0 0 1 15.5 8 V11" />
                </svg>
                <h1 className="font-display text-[17px] font-semibold tracking-[-0.02em]">
                    You can&apos;t open bookings
                </h1>
                <p className="max-w-[46ch] text-pretty text-[13px] leading-[1.55] text-muted-foreground">
                    {text}
                </p>
                <div className="mt-1.5 flex flex-wrap justify-center gap-2">
                    <Link
                        href="/"
                        className="inline-flex h-[38px] items-center rounded-[9px] border border-border bg-card px-4 text-[14px] font-semibold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 coarse:h-11"
                    >
                        Back to Home
                    </Link>
                </div>
            </div>
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

/**
 * The choice chip lives in `components/shared/chip.tsx` since the customer
 * picker (E4) shares it; re-exported so the Bookings screens import it from
 * here as before.
 */
export { Chip } from "@/components/shared/chip";

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

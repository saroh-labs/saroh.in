import { Button } from "@saroh/ui/button";
import { PermissionDeniedState } from "@saroh/ui/data-state";
import { cn } from "@saroh/ui/lib/utils";
import Link from "next/link";
import type { ReactNode } from "react";

import type { StatusTone } from "@/components/shared/status-badge";
import { whoCanChange } from "@/components/shared/who-can-change";
import type { DiaryState } from "@/lib/services/diary";

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
 * Bookings, locked for a role that can't read them (E5): the named denied
 * state, with why and who can change it. Not an error, and no retry, because
 * trying again does the same thing.
 *
 * It was a dashed card drawn by hand. Dashed is the shape of "nothing here
 * yet" (`EmptyState`), and a denial is a wall: `PermissionDeniedState`, the
 * one card every denial is drawn with, in `whoCanChange`'s words.
 */
export function BookingsLocked({
    business,
    role,
}: {
    /** The business's name. */
    business: string;
    /** What the role is called on screen, when known (`knownRoleName`). */
    role: string | null;
}) {
    return (
        <div className="px-[22px] py-[60px] max-[759px]:px-4">
            <PermissionDeniedState
                {...whoCanChange({ thing: "Bookings", business, role })}
                action={
                    <Button asChild variant="outline" className="wk-press">
                        <Link href="/">Back to Home</Link>
                    </Button>
                }
            />
        </div>
    );
}

/**
 * The badge each diary state wears: always the word (`STATE_LABEL`), the
 * hue only helps. Drawn with `StatusBadge`.
 */
export const STATE_TONE: Record<DiaryState, StatusTone> = {
    booked: "active",
    pending: "active",
    in: "success",
    noshow: "error",
    cancelled: "neutral",
    open: "success",
    full: "error",
};

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
        <div id={id} className={cn("label mb-1.5", className)}>
            {children}
        </div>
    );
}

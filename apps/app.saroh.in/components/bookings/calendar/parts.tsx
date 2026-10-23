import { Button } from "@saroh/ui/button";
import { PermissionDeniedState } from "@saroh/ui/data-state";
import { cn } from "@saroh/ui/lib/utils";
import Link from "next/link";
import type { ReactNode } from "react";

import type { StatusTone } from "@/components/shared/lists/status-badge";
import { whoCanChange } from "@/components/shared/states/who-can-change";
import type { DiaryState } from "@/lib/services/diary";

/**
 * Small pieces the Bookings screens share (the "Saroh Bookings" design):
 * the state pill and the choice chip. Where a screen sits ("Bookings ›
 * Calendar") is the page header's breadcrumb, as on every screen.
 */

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
        <div>
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
 * The choice chip lives in `components/shared/lists/chip.tsx` since the customer
 * picker (E4) shares it; re-exported so the Bookings screens import it from
 * here as before.
 */
export { Chip } from "@/components/shared/lists/chip";

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

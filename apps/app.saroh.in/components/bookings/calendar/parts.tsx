import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { PermissionDeniedState } from "@saroh/ui/data-state";
import { cn } from "@saroh/ui/lib/utils";
import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { whoCanChange } from "@/components/shared/who-can-change";
import type { DiaryState } from "@/lib/services/diary";
import { STATE_LABEL } from "@/lib/services/diary";

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

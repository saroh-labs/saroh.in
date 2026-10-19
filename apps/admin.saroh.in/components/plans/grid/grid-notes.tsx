"use client";

import { Button } from "@saroh/ui/button";

/**
 * The Plans grid's two lines of its own (admin redesign U11, U12): how its
 * keyboard works, named by the grid, and what to say when a search or a
 * filter leaves no feature to show.
 */

export function GridHint({ id, canEdit }: { id: string; canEdit: boolean }) {
    return (
        <p id={id} className="text-[12px] text-muted-foreground coarse:hidden">
            <span aria-hidden>
                ←↑↓→ move
                {canEdit ? " · Enter change · Esc cancel" : ""} · a
                feature&apos;s name opens it on every plan
            </span>
            <span className="sr-only">
                {canEdit
                    ? "Arrow keys move between cells. Enter changes a cell, Escape cancels. Enter on a feature's name opens it on every plan."
                    : "Arrow keys move between cells. Enter on a feature's name shows it on every plan. You can read pricing but not change it."}
            </span>
        </p>
    );
}

export function GridEmpty({
    none,
    unchanged,
    onShowAll,
}: {
    /** The catalogue has no features at all. */
    none: boolean;
    /** The Changed filter, with no search: nothing differs from live. */
    unchanged: boolean;
    /** Puts the search and filter back, while either narrows. */
    onShowAll?: () => void;
}) {
    return (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px] text-muted-foreground">
            <p>
                {none
                    ? "There are no features yet. Add one on the Modules tab."
                    : unchanged
                      ? "Nothing here differs from the live version yet."
                      : "No feature matches."}
            </p>
            {onShowAll && (
                <Button
                    type="button"
                    variant="link"
                    className="h-auto p-0 text-[13px]"
                    onClick={onShowAll}
                >
                    Show all features
                </Button>
            )}
        </div>
    );
}

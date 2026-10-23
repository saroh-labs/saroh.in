"use client";

import { Button } from "@saroh/ui/button";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";

/**
 * A tapped block's toolbar on a phone (DEC-185): Move up, Move down and
 * Remove, on the block itself, so the page is changed where it is read.
 * Each acts at once and offers Undo (`useUndo`, G3), as the desk does: no
 * confirm. It stops the tap reaching the block under it.
 */
export function BlockToolbar({
    index,
    count,
    onMove,
    onRemove,
}: {
    index: number;
    /** How many blocks the page has. */
    count: number;
    onMove: (delta: -1 | 1) => void;
    onRemove: () => void;
}) {
    return (
        <div
            role="toolbar"
            aria-label="Block actions"
            data-block-toolbar=""
            onClick={(e) => e.stopPropagation()}
            className="absolute right-2 top-2 z-20 flex gap-0.5 rounded-xl border bg-card p-1 font-sans text-foreground shadow-[0_8px_20px_hsl(var(--shadow-color)/0.18)]"
        >
            <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Move up"
                disabled={index === 0}
                onClick={() => onMove(-1)}
                className="h-11 w-11"
            >
                <ArrowUp aria-hidden />
            </Button>
            <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Move down"
                disabled={index >= count - 1}
                onClick={() => onMove(1)}
                className="h-11 w-11"
            >
                <ArrowDown aria-hidden />
            </Button>
            <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Remove"
                onClick={onRemove}
                className="h-11 w-11"
            >
                <Trash2 aria-hidden />
            </Button>
        </div>
    );
}

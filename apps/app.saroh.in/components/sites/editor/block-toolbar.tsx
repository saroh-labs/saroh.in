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
            className="absolute right-2 top-2 z-20 flex gap-0.5 rounded-xl bg-foreground p-0.5 font-sans text-background shadow-lg"
        >
            <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Move up"
                disabled={index === 0}
                onClick={() => onMove(-1)}
                className="size-11 text-background hover:bg-background/15 hover:text-background"
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
                className="size-11 text-background hover:bg-background/15 hover:text-background"
            >
                <ArrowDown aria-hidden />
            </Button>
            <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Remove"
                onClick={onRemove}
                className="size-11 text-background hover:bg-background/15 hover:text-background"
            >
                <Trash2 aria-hidden />
            </Button>
        </div>
    );
}

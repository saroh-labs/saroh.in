"use client";

import type { Cell } from "@saroh/pricing-catalog";
import { cn } from "@saroh/ui/lib/utils";

import type { CellChoice } from "./cell-editor";
import { CellEditor } from "./cell-editor";
import type { CellWas } from "./grid-model";
import { cellMark, cellWords } from "./grid-model";
import type { GridKeys, GridPos } from "./use-grid-keys";

/**
 * One plan's cell on one feature's row (admin redesign U11): ✓, — or the
 * number, and in amber what it was on the live version when the draft
 * changed it. "was …" is part of the cell's name, so a screen reader hears
 * it with the value. Clicking it, or Enter on it, opens it in place.
 */
export function GridCell({
    pos,
    keys,
    name,
    cell,
    limitRow,
    was,
    tinted,
    editing,
    canEdit,
    reach,
    usage,
    onOpen,
    onCommit,
    onCancel,
}: {
    pos: GridPos;
    keys: GridKeys;
    /** "Things on Plan B". */
    name: string;
    cell: Cell;
    limitRow: boolean;
    was: CellWas | null;
    /** The highlighted plan's column. */
    tinted: boolean;
    editing: boolean;
    canEdit: boolean;
    reach: string;
    usage: (limit: number | null) => string | null;
    onOpen: (p: GridPos) => void;
    onCommit: (choice: CellChoice) => void;
    onCancel: () => void;
}) {
    const words = cellWords(cell, limitRow);
    const label = was ? `${words}, ${was.words}` : words;
    return (
        <td
            role="gridcell"
            {...keys.cellProps(pos)}
            aria-label={editing ? undefined : label}
            aria-readonly={canEdit ? undefined : true}
            data-cell={name}
            // A click inside the open editor is the editor's own.
            onClick={() => {
                if (!editing) onOpen(pos);
            }}
            className={cn(
                "h-11 border-b border-border/70 px-2 text-center align-middle text-[13px] tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                tinted && "bg-highlight-subtle/40",
                canEdit && !editing && "cursor-pointer hover:bg-muted",
                editing && "bg-card py-2 align-top",
            )}
        >
            {editing ? (
                <CellEditor
                    label={name}
                    cell={cell}
                    limitRow={limitRow}
                    reach={reach}
                    usage={usage}
                    onCommit={onCommit}
                    onCancel={onCancel}
                />
            ) : (
                <span className="inline-grid justify-items-center leading-tight">
                    <span
                        aria-hidden
                        className={cn(
                            !cell.inc && "text-muted-foreground",
                            cell.inc &&
                                !limitRow &&
                                "font-semibold text-success",
                        )}
                    >
                        {cellMark(cell, limitRow)}
                    </span>
                    {was && (
                        <span
                            aria-hidden
                            className="text-[11px] font-medium text-warning"
                        >
                            {was.mark}
                        </span>
                    )}
                </span>
            )}
        </td>
    );
}

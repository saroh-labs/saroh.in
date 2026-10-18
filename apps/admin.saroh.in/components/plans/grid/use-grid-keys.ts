"use client";

import type { KeyboardEvent } from "react";
import { useCallback, useRef, useState } from "react";

/**
 * The Plans grid's keyboard (admin redesign U11, R20), as the ARIA grid
 * pattern has it: one cell is in the tab order at a time (roving tabindex),
 * so Tab enters and leaves the grid in one stop; the arrows move between
 * cells, Home and End go to the row's first and last cell (with Ctrl, the
 * grid's), and Enter opens the cell. Row -1 is the plans' header row when
 * there is one (`minRow: -1`), where Enter opens the price box. Column -1
 * is the features' names when they are part of it (`minCol: -1`, admin
 * redesign U12), where Enter opens the feature on every plan; Home and End
 * stay on the plans' cells, the row's first and last plan.
 *
 * Keys pressed inside an open cell's editor are its own: only a key aimed at
 * the cell itself moves.
 */

export interface GridPos {
    row: number;
    col: number;
}

export interface GridSize {
    rows: number;
    cols: number;
    /** -1 when the header row is part of the grid's keyboard. */
    minRow: number;
    /** -1 when the row headers are part of it; 0 by default. */
    minCol?: number;
}

export const posKey = (p: GridPos) => `${p.row}:${p.col}`;

function clampPos(p: GridPos, size: GridSize): GridPos {
    const maxRow = Math.max(size.minRow, size.rows - 1);
    return {
        row: Math.min(Math.max(p.row, size.minRow), maxRow),
        col: Math.min(
            Math.max(p.col, size.minCol ?? 0),
            Math.max(0, size.cols - 1),
        ),
    };
}

/**
 * Where a key moves from `pos`: the next position, or null for a key the
 * grid leaves alone (Tab, letters, Enter).
 */
export function nextPos(
    pos: GridPos,
    key: string,
    size: GridSize,
    ctrl = false,
): GridPos | null {
    if (size.cols === 0) return null;
    const lastRow = Math.max(size.minRow, size.rows - 1);
    switch (key) {
        case "ArrowRight":
            return clampPos({ ...pos, col: pos.col + 1 }, size);
        case "ArrowLeft":
            return clampPos({ ...pos, col: pos.col - 1 }, size);
        case "ArrowDown":
            return clampPos({ ...pos, row: pos.row + 1 }, size);
        case "ArrowUp":
            return clampPos({ ...pos, row: pos.row - 1 }, size);
        case "Home":
            return ctrl ? { row: size.minRow, col: 0 } : { ...pos, col: 0 };
        case "End":
            return ctrl
                ? { row: lastRow, col: size.cols - 1 }
                : { ...pos, col: size.cols - 1 };
        case "PageDown":
            return clampPos({ ...pos, row: pos.row + 5 }, size);
        case "PageUp":
            return clampPos({ ...pos, row: pos.row - 5 }, size);
        default:
            return null;
    }
}

export interface GridKeys {
    /** The cell in the tab order now. */
    active: GridPos;
    /** Put the keyboard on a cell (after an editor closes, say). */
    focusCell: (p: GridPos) => void;
    /** What each cell spreads on its own element. */
    cellProps: (p: GridPos) => {
        tabIndex: 0 | -1;
        ref: (el: HTMLElement | null) => void;
        onKeyDown: (e: KeyboardEvent<HTMLElement>) => void;
        onFocus: () => void;
    };
}

export function useGridKeys({
    size,
    onOpen,
}: {
    size: GridSize;
    /** Enter on a cell. */
    onOpen: (p: GridPos) => void;
}): GridKeys {
    const [held, setHeld] = useState<GridPos>({ row: 0, col: 0 });
    // A filter can take rows away from under the active cell.
    const active = clampPos(held, size);
    const cells = useRef(new Map<string, HTMLElement>());

    const focusCell = useCallback((p: GridPos) => {
        setHeld(p);
        cells.current.get(posKey(p))?.focus();
    }, []);

    const cellProps = useCallback(
        (p: GridPos) => {
            const key = posKey(p);
            return {
                tabIndex:
                    p.row === active.row && p.col === active.col
                        ? (0 as const)
                        : (-1 as const),
                ref: (el: HTMLElement | null) => {
                    if (el) cells.current.set(key, el);
                    else cells.current.delete(key);
                },
                onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
                    if (e.target !== e.currentTarget) return;
                    if (e.key === "Enter" || e.key === "F2") {
                        e.preventDefault();
                        onOpen(p);
                        return;
                    }
                    const next = nextPos(
                        p,
                        e.key,
                        size,
                        e.ctrlKey || e.metaKey,
                    );
                    if (!next) return;
                    e.preventDefault();
                    focusCell(next);
                },
                // A click, or focus inside the cell's editor, makes it the
                // one Tab comes back to.
                onFocus: () => setHeld(p),
            };
        },
        [active.row, active.col, size, onOpen, focusCell],
    );

    return { active, focusCell, cellProps };
}

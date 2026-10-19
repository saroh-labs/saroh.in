/** @vitest-environment jsdom */
import { act, renderHook } from "@testing-library/react";
import type { KeyboardEvent } from "react";
import { describe, expect, it, vi } from "vitest";

import type { GridPos, GridSize } from "./use-grid-keys";
import { nextPos, useGridKeys } from "./use-grid-keys";

const size: GridSize = { rows: 4, cols: 3, minRow: -1 };
const at = (row: number, col: number): GridPos => ({ row, col });

describe("where a key moves", () => {
    it("moves one cell with the arrows, and stops at the edges", () => {
        expect(nextPos(at(1, 1), "ArrowRight", size)).toEqual(at(1, 2));
        expect(nextPos(at(1, 2), "ArrowRight", size)).toEqual(at(1, 2));
        expect(nextPos(at(1, 0), "ArrowLeft", size)).toEqual(at(1, 0));
        expect(nextPos(at(1, 1), "ArrowDown", size)).toEqual(at(2, 1));
        expect(nextPos(at(3, 1), "ArrowDown", size)).toEqual(at(3, 1));
    });

    it("goes up onto the header row, and no further", () => {
        expect(nextPos(at(0, 2), "ArrowUp", size)).toEqual(at(-1, 2));
        expect(nextPos(at(-1, 2), "ArrowUp", size)).toEqual(at(-1, 2));
        expect(nextPos(at(0, 2), "ArrowUp", { ...size, minRow: 0 })).toEqual(
            at(0, 2),
        );
    });

    it("goes to the row's first and last cell with Home and End, the grid's with Ctrl", () => {
        expect(nextPos(at(2, 1), "Home", size)).toEqual(at(2, 0));
        expect(nextPos(at(2, 1), "End", size)).toEqual(at(2, 2));
        expect(nextPos(at(2, 1), "Home", size, true)).toEqual(at(-1, 0));
        expect(nextPos(at(2, 1), "End", size, true)).toEqual(at(3, 2));
    });

    it("goes left onto the features' names when they are part of it, Home staying on the plans", () => {
        const names = { ...size, minCol: -1 };
        expect(nextPos(at(1, 0), "ArrowLeft", names)).toEqual(at(1, -1));
        expect(nextPos(at(1, -1), "ArrowLeft", names)).toEqual(at(1, -1));
        expect(nextPos(at(1, -1), "ArrowRight", names)).toEqual(at(1, 0));
        expect(nextPos(at(1, 2), "Home", names)).toEqual(at(1, 0));
        expect(nextPos(at(1, -1), "ArrowUp", names)).toEqual(at(0, -1));
    });

    it("leaves Tab, Enter and letters to someone else", () => {
        for (const k of ["Tab", "Enter", "a", "/", "Escape"])
            expect(nextPos(at(1, 1), k, size)).toBeNull();
    });

    it("has nowhere to go in a grid with no plans", () => {
        expect(
            nextPos(at(0, 0), "ArrowRight", { ...size, cols: 0 }),
        ).toBeNull();
    });
});

function cellAt(els: Map<string, HTMLElement>, k: string): HTMLElement {
    const el = els.get(k);
    if (!el) throw new Error(`no cell ${k}`);
    return el;
}

/** A key press as React hands it to a cell. */
function press(target: HTMLElement, k: string, from: HTMLElement = target) {
    const e = {
        key: k,
        target: from,
        currentTarget: target,
        ctrlKey: false,
        metaKey: false,
        preventDefault: vi.fn(),
    };
    return { e, event: e as unknown as KeyboardEvent<HTMLElement> };
}

describe("the roving tab stop", () => {
    function grid(rows = 2, cols = 2) {
        const onOpen = vi.fn();
        const hook = renderHook(
            ({ rows: r }: { rows: number }) =>
                useGridKeys({ size: { rows: r, cols, minRow: -1 }, onOpen }),
            { initialProps: { rows } },
        );
        const els = new Map<string, HTMLElement>();
        const mount = () => {
            for (let r = -1; r < rows; r++)
                for (let c = 0; c < cols; c++) {
                    const el = document.createElement("td");
                    el.tabIndex = -1;
                    document.body.append(el);
                    els.set(`${r}:${c}`, el);
                    hook.result.current.cellProps(at(r, c)).ref(el);
                }
        };
        mount();
        return { hook, onOpen, els };
    }

    it("puts one cell in the tab order, the first one to start", () => {
        const { hook } = grid();
        const stops = [at(-1, 0), at(0, 0), at(0, 1), at(1, 1)].map(
            (p) => hook.result.current.cellProps(p).tabIndex,
        );
        expect(stops).toEqual([-1, 0, -1, -1]);
    });

    it("moves the stop and the focus with an arrow", () => {
        const { hook, els } = grid();
        const from = cellAt(els, "0:0");
        const { e, event } = press(from, "ArrowDown");
        act(() => hook.result.current.cellProps(at(0, 0)).onKeyDown(event));
        expect(e.preventDefault).toHaveBeenCalled();
        expect(document.activeElement).toBe(els.get("1:0"));
        expect(hook.result.current.active).toEqual(at(1, 0));
        expect(hook.result.current.cellProps(at(1, 0)).tabIndex).toBe(0);
    });

    it("opens the cell on Enter", () => {
        const { hook, els, onOpen } = grid();
        const { event } = press(cellAt(els, "0:1"), "Enter");
        act(() => hook.result.current.cellProps(at(0, 1)).onKeyDown(event));
        expect(onOpen).toHaveBeenCalledWith(at(0, 1));
    });

    it("ignores a key pressed inside the cell's editor", () => {
        const { hook, els, onOpen } = grid();
        const input = document.createElement("input");
        const { e, event } = press(cellAt(els, "0:0"), "ArrowDown", input);
        act(() => hook.result.current.cellProps(at(0, 0)).onKeyDown(event));
        const enter = press(cellAt(els, "0:0"), "Enter", input);
        act(() =>
            hook.result.current.cellProps(at(0, 0)).onKeyDown(enter.event),
        );
        expect(e.preventDefault).not.toHaveBeenCalled();
        expect(onOpen).not.toHaveBeenCalled();
        expect(hook.result.current.active).toEqual(at(0, 0));
    });

    it("keeps the stop inside the grid when a filter takes rows away", () => {
        const { hook, els } = grid(3);
        act(() => hook.result.current.focusCell(at(2, 1)));
        expect(document.activeElement).toBe(els.get("2:1"));
        hook.rerender({ rows: 1 });
        expect(hook.result.current.active).toEqual(at(0, 1));
    });

    it("makes a cell focused by a click the stop", () => {
        const { hook } = grid();
        act(() => hook.result.current.cellProps(at(1, 1)).onFocus());
        expect(hook.result.current.active).toEqual(at(1, 1));
    });
});

// @vitest-environment jsdom
import type { Editor } from "@tiptap/react";
import { act, createElement } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useCanUndo } from "./use-can-undo";

/** Enough of Tiptap: its history, and its transaction event. */
function fakeEditor() {
    const listeners = new Map<string, Set<() => void>>();
    const state = { undo: false, redo: false };
    const editor = {
        isInitialized: true,
        can: () => ({ undo: () => state.undo, redo: () => state.redo }),
        on: (e: string, f: () => void) => {
            if (!listeners.has(e)) listeners.set(e, new Set());
            listeners.get(e)?.add(f);
        },
        off: (e: string, f: () => void) => listeners.get(e)?.delete(f),
    };
    const transact = (next: Partial<typeof state>) => {
        Object.assign(state, next);
        listeners.get("transaction")?.forEach((f) => f());
    };
    return { editor: editor as unknown as Editor, transact };
}

let root: Root;
let can = { undo: false, redo: false };

function Probe({
    editor,
    report,
}: {
    editor: Editor | null;
    report: (next: typeof can) => void;
}) {
    report(useCanUndo(editor));
    return null;
}
const report = (next: typeof can) => {
    can = next;
};

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    root = createRoot(document.createElement("div"));
});
afterEach(() => act(() => root.unmount()));

describe("the post editor's Undo and Redo (editor audit, 21 Nov)", () => {
    it("are never lit on open, light after an edit, and follow Undo", () => {
        act(() => root.render(createElement(Probe, { editor: null, report })));
        expect(can).toEqual({ undo: false, redo: false });
        const { editor, transact } = fakeEditor();
        act(() => root.render(createElement(Probe, { editor, report })));
        expect(can).toEqual({ undo: false, redo: false });
        act(() => transact({ undo: true }));
        expect(can).toEqual({ undo: true, redo: false });
        act(() => transact({ undo: false, redo: true }));
        expect(can).toEqual({ undo: false, redo: true });
    });
});

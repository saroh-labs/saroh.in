// @vitest-environment jsdom
/**
 * The editor's Undo over the shared hold (G3). The editor-level scenarios —
 * remove and Undo, two removes, autosave during the toast, a failed save
 * after Undo — are in `site-editor.test.tsx`, where the autosave runs. These
 * pin the hook on its own: what each action says, what Undo puts back, and
 * when the window closes early.
 */
import { act, createElement, useState } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { EditorUndo } from "@/components/sites/editor/use-undo";
import { useUndo } from "@/components/sites/editor/use-undo";
import type { Section } from "@/lib/sites/service";
import type { SiteStyle } from "@/lib/sites/style";

const toast = vi.hoisted(() => {
    let next = 0;
    return {
        showUndo: vi.fn(() => `t${++next}`),
        dismissToast: vi.fn(),
    };
});
vi.mock("@saroh/ui/toast", () => toast);

const A: Section = {
    key: "a",
    type: "hero",
    contractVersion: 1,
    content: { heading: "A" },
};
const B: Section = {
    key: "b",
    type: "faq",
    contractVersion: 1,
    content: { title: "B" },
} as unknown as Section;
const LOOK: SiteStyle = { colours: { accent: "plum" }, scalars: {} };
const PLAIN: SiteStyle = { colours: { accent: "ink" }, scalars: {} };

interface Harness {
    undo: EditorUndo;
    sections: Section[];
    style: SiteStyle;
    setSections: (next: Section[]) => void;
    setStyle: (next: SiteStyle) => void;
    selected: number | null;
}

let root: Root;
let host: HTMLDivElement;
let h: Harness;

function Probe({ report }: { report: (next: Harness) => void }) {
    const [sections, setSections] = useState<Section[]>([A, B]);
    const [style, setStyle] = useState<SiteStyle>(LOOK);
    const [selected, setSelected] = useState<number | null>(0);
    const undo = useUndo({
        sections,
        restoreSections: setSections,
        removeAt: (i) => setSections((s) => s.filter((_, j) => j !== i)),
        moveTo: (from, to) =>
            setSections((s) => {
                const next = [...s];
                const [item] = next.splice(from, 1);
                next.splice(to, 0, item);
                return next;
            }),
        toggleHidden: (i) =>
            setSections((s) =>
                s.map((x, j) => (j === i ? { ...x, hidden: !x.hidden } : x)),
            ),
        style,
        setStyle,
        resetStyle: () => setStyle(PLAIN),
        setSelectedIndex: setSelected,
    });
    report({ undo, sections, style, setSections, setStyle, selected });
    return null;
}

/** The id the last Undo toast was given. */
function lastId(): string {
    return toast.showUndo.mock.results.at(-1)?.value as string;
}

/** Press Undo on the last toast shown. */
function pressUndo() {
    const call = toast.showUndo.mock.calls.at(-1) as unknown as
        [string, () => void] | undefined;
    if (!call) throw new Error("No Undo toast");
    act(() => call[1]());
}

beforeEach(() => {
    vi.useFakeTimers();
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    root = createRoot(host);
    act(() =>
        root.render(
            createElement(Probe, {
                report: (next) => {
                    h = next;
                },
            }),
        ),
    );
});

afterEach(() => {
    act(() => root.unmount());
    vi.clearAllMocks();
    vi.useRealTimers();
});

describe("useUndo", () => {
    it("removes, names the block, and Undo puts it back where it was, selected", () => {
        act(() => h.undo.removeAt(0));
        expect(h.sections).toEqual([B]);
        expect(h.selected).toBeNull();
        expect(toast.showUndo).toHaveBeenCalledWith(
            "Hero taken off this page",
            expect.any(Function),
            { duration: 10_000 },
        );
        pressUndo();
        expect(h.sections).toEqual([A, B]);
        expect(h.selected).toBe(0);
    });

    it("says which way a block moved, and Undo moves it back", () => {
        act(() => h.undo.move(0, 1));
        expect(h.sections).toEqual([B, A]);
        expect(toast.showUndo).toHaveBeenLastCalledWith(
            "Hero moved down",
            expect.any(Function),
            { duration: 10_000 },
        );
        act(() => h.undo.moveTo(1, 0));
        expect(toast.showUndo).toHaveBeenLastCalledWith(
            "Hero moved up",
            expect.any(Function),
            { duration: 10_000 },
        );
        pressUndo();
        expect(h.sections).toEqual([B, A]);
        expect(h.selected).toBe(1);
    });

    it("offers nothing for a move that goes nowhere", () => {
        act(() => h.undo.move(0, -1));
        act(() => h.undo.moveTo(1, 1));
        act(() => h.undo.removeAt(5));
        expect(toast.showUndo).not.toHaveBeenCalled();
        expect(h.sections).toEqual([A, B]);
    });

    it("hides and shows with the words for each", () => {
        act(() => h.undo.toggleHidden(1));
        expect(toast.showUndo).toHaveBeenLastCalledWith(
            "FAQ is hidden on this page",
            expect.any(Function),
            { duration: 10_000 },
        );
        act(() => h.undo.toggleHidden(1));
        expect(toast.showUndo).toHaveBeenLastCalledWith(
            "FAQ is back on this page",
            expect.any(Function),
            { duration: 10_000 },
        );
        pressUndo();
        expect(h.sections[1].hidden).toBe(true);
    });

    it("resets the look, and Undo brings the old one back", () => {
        act(() => h.undo.resetStyle());
        expect(h.style).toEqual(PLAIN);
        expect(toast.showUndo).toHaveBeenLastCalledWith(
            "Back to the starting look",
            expect.any(Function),
            { duration: 10_000 },
        );
        pressUndo();
        expect(h.style).toEqual(LOOK);
    });

    it("closes the window when the look changes again, and leaves the blocks' Undo alone", () => {
        act(() => h.undo.resetStyle());
        act(() => h.setSections([B, A]));
        expect(toast.dismissToast).not.toHaveBeenCalled();
        act(() => h.setStyle({ colours: { accent: "sea" }, scalars: {} }));
        expect(toast.dismissToast).toHaveBeenCalledWith(lastId());
        pressUndo();
        expect(h.style.colours.accent).toBe("sea");
    });

    it("ends after ten seconds: the toast goes, and Undo does nothing", () => {
        act(() => h.undo.removeAt(0));
        act(() => {
            vi.advanceTimersByTime(10_000);
        });
        expect(toast.dismissToast).toHaveBeenCalledWith(lastId());
        pressUndo();
        expect(h.sections).toEqual([B]);
    });

    it("takes the toast away when the editor unmounts", () => {
        act(() => h.undo.removeAt(0));
        act(() => root.unmount());
        expect(toast.dismissToast).toHaveBeenCalledWith(lastId());
        root = createRoot(host);
    });
});

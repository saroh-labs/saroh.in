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
import {
    forgetCarriedHistory,
    useUndo,
} from "@/components/sites/editor/use-undo";
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

function Probe({
    report,
    initial = [A, B],
    carryKey,
    stamping,
}: {
    report: (next: Harness) => void;
    initial?: Section[];
    carryKey?: string;
    stamping?: { current: boolean };
}) {
    const [sections, setSections] = useState<Section[]>(initial);
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
        carryKey,
        stamping,
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
            "Top of the page taken off this page",
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
            "Top of the page moved down",
            expect.any(Function),
            { duration: 10_000 },
        );
        act(() => h.undo.moveTo(1, 0));
        expect(toast.showUndo).toHaveBeenLastCalledWith(
            "Top of the page moved up",
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
            "Questions and answers is hidden on this page",
            expect.any(Function),
            { duration: 10_000 },
        );
        act(() => h.undo.toggleHidden(1));
        expect(toast.showUndo).toHaveBeenLastCalledWith(
            "Questions and answers is back on this page",
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
            "Colours, type and spacing reset.",
            expect.any(Function),
            { duration: 10_000 },
        );
        pressUndo();
        expect(h.style).toEqual(LOOK);
    });

    it("takes the toast away when anything changes again: its Undo would skip that change", () => {
        act(() => h.undo.resetStyle());
        act(() => h.setSections([B, A]));
        expect(toast.dismissToast).toHaveBeenCalledWith(lastId());
        pressUndo();
        expect(h.sections).toEqual([B, A]);
        expect(h.style).toEqual(PLAIN);
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

describe("the top bar's Undo and More › Redo (U46)", () => {
    it("Undo does what the toast does", () => {
        act(() => h.undo.removeAt(0));
        expect(h.undo.canUndo).toBe(true);
        act(() => h.undo.undo());
        expect(h.sections).toEqual([A, B]);
        expect(h.undo.canUndo).toBe(false);
        expect(toast.dismissToast).toHaveBeenCalledWith(lastId());
    });

    it("stays pressable after the toast's ten seconds: the history is the editor's", () => {
        act(() => h.undo.removeAt(0));
        act(() => {
            vi.advanceTimersByTime(10_000);
        });
        expect(h.undo.canUndo).toBe(true);
        act(() => h.undo.undo());
        expect(h.sections).toEqual([A, B]);
    });

    it("Redo puts the removal back, once", () => {
        expect(h.undo.canRedo).toBe(false);
        act(() => h.undo.removeAt(0));
        pressUndo();
        expect(h.undo.canRedo).toBe(true);
        act(() => h.undo.redo());
        expect(h.sections).toEqual([B]);
        expect(h.undo.canRedo).toBe(false);
    });

    it("a new edit clears Redo", () => {
        act(() => h.undo.removeAt(0));
        pressUndo();
        act(() => h.setSections([B, A]));
        expect(h.undo.canRedo).toBe(false);
        act(() => h.undo.redo());
        expect(h.sections).toEqual([B, A]);
    });

    it("Redo works for the look too", () => {
        act(() => h.undo.resetStyle());
        pressUndo();
        expect(h.style).toBe(LOOK);
        act(() => h.undo.redo());
        expect(h.style).toBe(PLAIN);
    });
});

/** A field edit, as the inspector or typing on the page makes one. */
function typeHeading(text: string) {
    act(() =>
        h.setSections([
            { ...h.sections[0], content: { heading: text } } as Section,
            ...h.sections.slice(1),
        ]),
    );
}

describe("one history for the whole editor (editor audit F2)", () => {
    it("is never lit on open", () => {
        expect(h.undo.canUndo).toBe(false);
        expect(h.undo.canRedo).toBe(false);
    });

    it("lights up after a field edit, and Undo puts the words back", () => {
        typeHeading("Ab");
        expect(h.undo.canUndo).toBe(true);
        act(() => h.undo.undo());
        expect(h.sections[0].content).toEqual({ heading: "A" });
        expect(h.undo.canUndo).toBe(false);
        expect(h.undo.canRedo).toBe(true);
        act(() => h.undo.redo());
        expect(h.sections[0].content).toEqual({ heading: "Ab" });
    });

    it("takes a burst of typing back as one step, and a pause as two", () => {
        typeHeading("Ab");
        act(() => {
            vi.advanceTimersByTime(300);
        });
        typeHeading("Abc");
        act(() => {
            vi.advanceTimersByTime(2000);
        });
        typeHeading("Abcd");
        act(() => h.undo.undo());
        expect(h.sections[0].content).toEqual({ heading: "Abc" });
        act(() => h.undo.undo());
        expect(h.sections[0].content).toEqual({ heading: "A" });
    });

    it("goes back through Brand, moves and typing in the order they were made", () => {
        typeHeading("Ab");
        act(() => {
            vi.advanceTimersByTime(2000);
        });
        act(() => h.setStyle({ colours: { accent: "sea" }, scalars: {} }));
        act(() => h.undo.move(0, 1));
        act(() => h.undo.undo());
        expect(h.sections.map((x) => x.key)).toEqual(["a", "b"]);
        expect(h.style.colours.accent).toBe("sea");
        act(() => h.undo.undo());
        expect(h.style).toEqual(LOOK);
        act(() => h.undo.undo());
        expect(h.sections[0].content).toEqual({ heading: "A" });
        expect(h.undo.canUndo).toBe(false);
        // And forward again, in the same order.
        act(() => h.undo.redo());
        act(() => h.undo.redo());
        act(() => h.undo.redo());
        expect(h.sections.map((x) => x.key)).toEqual(["b", "a"]);
        expect(h.style.colours.accent).toBe("sea");
    });

    it("an Undo or Redo is not itself a step", () => {
        typeHeading("Ab");
        act(() => h.undo.undo());
        act(() => h.undo.redo());
        act(() => h.undo.undo());
        expect(h.undo.canUndo).toBe(false);
        expect(h.undo.canRedo).toBe(true);
    });
});

describe("Ask AI's words, applied in the draft (editor audit F2)", () => {
    function mount(props: {
        initial?: Section[];
        stamping?: { current: boolean };
    }) {
        act(() =>
            root.render(
                createElement(Probe, {
                    ...props,
                    carryKey: "s1:p1",
                    report: (next) => {
                        h = next;
                    },
                }),
            ),
        );
    }

    afterEach(() => forgetCarriedHistory());

    it("are one more step after the editor starts afresh on them, and Undo takes them back", () => {
        act(() => root.unmount());
        root = createRoot(host);
        mount({});
        typeHeading("Ab");
        act(() => h.undo.carry());
        act(() => root.unmount());
        root = createRoot(host);
        // The draft read again, with Ask AI's heading in it.
        const applied = { ...A, content: { heading: "Ask AI's" } } as Section;
        mount({ initial: [applied, B] });
        expect(h.undo.canUndo).toBe(true);
        act(() => h.undo.undo());
        expect(h.sections[0].content).toEqual({ heading: "Ab" });
        act(() => h.undo.undo());
        expect(h.sections[0].content).toEqual({ heading: "A" });
    });

    it("is not handed to an editor opened later on its own", () => {
        act(() => root.unmount());
        root = createRoot(host);
        mount({});
        typeHeading("Ab");
        act(() => h.undo.carry());
        act(() => {
            vi.advanceTimersByTime(60_000);
        });
        act(() => root.unmount());
        root = createRoot(host);
        mount({});
        expect(h.undo.canUndo).toBe(false);
    });
});

describe("a save's form ids are not a step", () => {
    it("folds them into the step before, so Undo stays one press", () => {
        const stamping = { current: false };
        act(() => root.unmount());
        root = createRoot(host);
        act(() =>
            root.render(
                createElement(Probe, {
                    stamping,
                    report: (next) => {
                        h = next;
                    },
                }),
            ),
        );
        typeHeading("Ab");
        act(() => {
            vi.advanceTimersByTime(2000);
        });
        stamping.current = true;
        act(() =>
            h.setSections([
                h.sections[0],
                { ...h.sections[1], formId: "f1" } as unknown as Section,
            ]),
        );
        act(() => h.undo.undo());
        expect(h.sections[0].content).toEqual({ heading: "A" });
        expect(h.undo.canUndo).toBe(false);
    });
});

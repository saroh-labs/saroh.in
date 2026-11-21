import type { ToastId } from "@saroh/ui/toast";
import { dismissToast, showUndo } from "@saroh/ui/toast";
import { useEffect, useRef, useState } from "react";

import { HOLD_UNDO_MS } from "@/lib/hold-undo";
import type { Section } from "@/lib/sites/service";
import type { SiteStyle } from "@/lib/sites/style";
import { SECTION_LABELS } from "./editor-constants";

/** Which document a step changed: the page's blocks, or the site's look. */
type Doc = "sections" | "style";

/** One step back: what the document was before it, and after. */
interface Step {
    doc: Doc;
    before: unknown;
    after: unknown;
    /** When it last grew: typing within a second is one step. */
    at: number;
    /** Typing and field edits join up; a move, a removal or a reset never. */
    typing: boolean;
    /** The block selected once this step is undone, and once redone. */
    select?: { undone: number | null; redone: number | null };
}

interface History {
    past: Step[];
    future: Step[];
}

/** Edits to one document this close together are one step. */
export const TYPING_MS = 1000;

/**
 * The history an editor hands on when it is started afresh on its own
 * change (Ask AI applied new words, which reloads the draft): the new
 * editor picks it up, with that change as one more step. Kept briefly.
 */
const carried = new Map<
    string,
    { history: History; sections: unknown; style: unknown; at: number }
>();
const CARRY_MS = 30_000;

/** Tests start clean. */
export function forgetCarriedHistory() {
    carried.clear();
}

const same = (a: unknown, b: unknown) =>
    a === b || JSON.stringify(a) === JSON.stringify(b);

/**
 * The editor's one Undo history (editor audit, 21 Nov): every change to the
 * page's blocks and to the look, in order. Field edits and typing on the
 * page, Brand's choices, Ask AI's applied words (see `carry`), moves,
 * duplicates, hides and removals all land here, so the top bar's Undo and
 * Redo cover each of them. A text field's own Ctrl-Z while typing is the
 * browser's, and stays.
 *
 * Remove, move, hide and reset happen at once and say so with "Undo" for
 * ten seconds (G3, R4); that toast undoes the same step as the top bar,
 * while it is still the latest. The draft autosaves as it always has; an
 * Undo puts the previous draft back and the autosave saves that in turn,
 * so a change undone to its live value stops waiting to publish.
 */
export function useUndo({
    sections,
    restoreSections,
    removeAt,
    moveTo,
    toggleHidden,
    style,
    setStyle,
    resetStyle,
    setSelectedIndex,
    readOnly = false,
    carryKey,
    stamping,
}: {
    sections: Section[];
    restoreSections: (previous: Section[]) => void;
    removeAt: (index: number) => void;
    moveTo: (from: number, to: number) => void;
    toggleHidden: (index: number) => void;
    style: SiteStyle;
    setStyle: (next: SiteStyle) => void;
    resetStyle: () => void;
    setSelectedIndex: (index: number | null) => void;
    /** Undo off (DEC-200): read-only, nothing here changes anything. */
    readOnly?: boolean;
    /** Site and page: where a history waits across a fresh start. */
    carryKey?: string;
    /** Set while a save writes ids into the blocks: not the merchant's step. */
    stamping?: { current: boolean };
}) {
    // Read once: what an editor started afresh on its own change hands on.
    const [handed] = useState(() => {
        const c = carryKey ? carried.get(carryKey) : undefined;
        return c && Date.now() - c.at < CARRY_MS ? c : null;
    });
    // The steps, mutated in place: a redraw follows each change.
    const [history] = useState<History>(() => {
        const h: History = handed
            ? { past: [...handed.history.past], future: [] }
            : { past: [], future: [] };
        // The change that started this editor afresh is one more step.
        if (handed && !same(handed.sections, sections)) {
            h.past.push(step("sections", handed.sections, sections, false));
        }
        if (handed && !same(handed.style, style)) {
            h.past.push(step("style", handed.style, style, false));
        }
        return h;
    });
    useEffect(() => {
        if (carryKey) carried.delete(carryKey);
    }, [carryKey]);

    const seen = useRef<Record<Doc, unknown>>({ sections, style });
    // A value this hook set itself (Undo, Redo, an action): not a new step.
    const expected = useRef<{ doc: Doc; value: unknown } | null>(null);
    // Reset's words, for the change it is about to make.
    const resetting = useRef<number | null>(null);
    const toast = useRef<{ id: ToastId; step: Step } | null>(null);
    const [, redraw] = useState(0);
    const changed = () => redraw((n) => n + 1);

    const hist = () => history;

    function closeToast() {
        if (toast.current) dismissToast(toast.current.id);
        toast.current = null;
    }

    function apply(doc: Doc, value: unknown) {
        expected.current = { doc, value };
        if (doc === "sections") restoreSections(value as Section[]);
        else setStyle(value as SiteStyle);
    }

    function push(next: Step) {
        const h = hist();
        const top = h.past.at(-1);
        if (
            next.typing &&
            top?.typing &&
            top.doc === next.doc &&
            next.at - top.at < TYPING_MS
        ) {
            top.after = next.after;
            top.at = next.at;
        } else {
            h.past.push(next);
        }
        h.future = [];
        closeToast();
        changed();
    }

    function observe(doc: Doc, value: unknown) {
        const before = seen.current[doc];
        if (value === before) return;
        seen.current[doc] = value;
        const exp = expected.current;
        if (exp?.doc === doc) {
            expected.current = null;
            if (same(exp.value, value)) return;
        }
        if (doc === "sections" && stamping?.current) {
            // Form ids from a save: the latest step now ends with them.
            stamping.current = false;
            const top = hist().past.at(-1);
            if (top?.doc === "sections" && top.after === before) {
                top.after = value;
            }
            return;
        }
        if (readOnly) return;
        if (
            doc === "style" &&
            resetting.current !== null &&
            Date.now() - resetting.current < TYPING_MS
        ) {
            resetting.current = null;
            const s = step(doc, before, value, false);
            push(s);
            say("Colours, type and spacing reset.", s);
            return;
        }
        push(step(doc, before, value, true));
    }

    useEffect(() => observe("sections", sections));
    useEffect(() => observe("style", style));

    // Leaving the editor: its toast goes with the page it belonged to.
    useEffect(() => () => closeToast(), []);

    function say(message: string, s: Step) {
        const id = showUndo(
            message,
            () => {
                if (toast.current?.step === s && hist().past.at(-1) === s) {
                    undo();
                }
            },
            { duration: HOLD_UNDO_MS },
        );
        toast.current = { id, step: s };
        setTimeout(() => {
            if (toast.current?.id === id) closeToast();
        }, HOLD_UNDO_MS);
    }

    /** An action that knows what it leaves: its step, at once, with a toast. */
    function act(
        message: string,
        after: Section[],
        select: Step["select"],
        run: () => void,
    ) {
        if (readOnly) return;
        const s = step("sections", sections, after, false, select);
        push(s);
        expected.current = { doc: "sections", value: after };
        run();
        say(message, s);
    }

    function undo() {
        if (readOnly) return;
        const h = hist();
        const s = h.past.pop();
        if (!s) return;
        h.future.push(s);
        closeToast();
        apply(s.doc, s.before);
        if (s.select) setSelectedIndex(s.select.undone);
        changed();
    }

    const label = (section: Section) => SECTION_LABELS[section.type];

    function moveWithUndo(from: number, to: number) {
        const count = sections.length;
        if (from < 0 || from >= count || to < 0 || to >= count) return;
        if (from === to) return;
        const section = sections[from];
        const after = [...sections];
        const [item] = after.splice(from, 1);
        after.splice(to, 0, item);
        act(
            `${label(section)} moved ${to < from ? "up" : "down"}`,
            after,
            { undone: from, redone: to },
            () => moveTo(from, to),
        );
    }

    const h = hist();
    return {
        /** Something on this page or in the look can be taken back. */
        canUndo: !readOnly && h.past.length > 0,
        /** Take back the latest step: the same as an action's toast. */
        undo,
        /** Something Undo took back can be put back. */
        canRedo: !readOnly && h.future.length > 0,
        /** Put back what Undo took back, until the next edit. */
        redo() {
            if (readOnly) return;
            const s = h.future.pop();
            if (!s) return;
            h.past.push(s);
            closeToast();
            apply(s.doc, s.after);
            if (s.select) setSelectedIndex(s.select.redone);
            changed();
        },
        /**
         * Take the toast away now. Opening the pre-publish check does this:
         * an Undo pressed behind the check would change the draft the
         * merchant is about to publish (review G-1).
         */
        settleUndo() {
            closeToast();
        },
        /**
         * The editor is about to start afresh on a change of its own (Ask
         * AI applied or undid words): hand the history to the next one.
         */
        carry() {
            if (!carryKey) return;
            carried.set(carryKey, {
                history: { past: [...h.past], future: [] },
                sections: seen.current.sections,
                style: seen.current.style,
                at: Date.now(),
            });
        },
        removeAt(index: number) {
            if (index < 0 || index >= sections.length) return;
            act(
                `${label(sections[index])} taken off this page`,
                sections.filter((_, i) => i !== index),
                { undone: index, redone: null },
                () => {
                    removeAt(index);
                    setSelectedIndex(null);
                },
            );
        },
        /**
         * Any other change to the sections, with Undo (U47: Duplicate, Hide
         * on phone). `select` is the section selected after it and after
         * its Undo.
         */
        changeWithUndo(
            message: string,
            next: Section[],
            select?: { after: number; undone: number },
        ) {
            act(
                message,
                next,
                select && { undone: select.undone, redone: select.after },
                () => {
                    restoreSections(next);
                    if (select) setSelectedIndex(select.after);
                },
            );
        },
        moveTo: moveWithUndo,
        move: (index: number, delta: number) =>
            moveWithUndo(index, index + delta),
        toggleHidden(index: number) {
            if (index < 0 || index >= sections.length) return;
            const section = sections[index];
            act(
                section.hidden
                    ? `${label(section)} is back on this page`
                    : `${label(section)} is hidden on this page`,
                sections.map((s, i) =>
                    i === index ? { ...s, hidden: !s.hidden } : s,
                ),
                undefined,
                () => toggleHidden(index),
            );
        },
        resetStyle() {
            if (readOnly) return;
            resetting.current = Date.now();
            resetStyle();
        },
    };
}

function step(
    doc: Doc,
    before: unknown,
    after: unknown,
    typing: boolean,
    select?: Step["select"],
): Step {
    return { doc, before, after, at: Date.now(), typing, select };
}

export type EditorUndo = ReturnType<typeof useUndo>;

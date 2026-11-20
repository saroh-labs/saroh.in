import type { ToastId } from "@saroh/ui/toast";
import { dismissToast, showUndo } from "@saroh/ui/toast";
import { useEffect, useRef, useState } from "react";

import type { Hold, HoldSlot } from "@/lib/hold-undo";
import { createHoldSlot, HOLD_UNDO_MS } from "@/lib/hold-undo";
import type { Section } from "@/lib/sites/service";
import type { SiteStyle } from "@/lib/sites/style";
import { SECTION_LABELS } from "./editor-constants";

/** Which document an Undo puts back: the page's blocks, or the site's look. */
type Doc = "sections" | "style";

/**
 * The action being held, and the state it would put back. `after` is what the
 * action left, filled in on the render that draws it: once the document moves
 * past that, the Undo would throw the newer work away, so its window closes.
 */
interface Watch {
    hold: Hold;
    doc: Doc;
    before: unknown;
    after: unknown;
    armed: boolean;
}

/**
 * The one action Undo took back, so More › Redo can put it back (U46). It
 * lasts until the document moves on: `restored` is what the Undo left, and
 * any other value means a new edit, which drops it.
 */
interface Redo {
    doc: Doc;
    value: unknown;
    restored: unknown;
}

/**
 * A held document changed. The first change after the action is the action
 * itself; any later one is newer work, so the window closes.
 */
function closeOnLaterChange(w: Watch | null, doc: Doc, value: unknown) {
    if (w?.doc !== doc || value === w.before) return;
    if (!w.armed) {
        w.after = value;
        w.armed = true;
        return;
    }
    if (value !== w.after) void w.hold.commitNow();
}

/**
 * Undo in place of a confirmation (G3, R4). Removing, moving or hiding a
 * block, or resetting the look, happens at once and says so with "Undo" for
 * ten seconds. The draft autosaves as it always has; Undo puts the previous
 * draft back, and the autosave saves that in turn.
 *
 * - One Undo undoes one action: a second action closes the first's window
 *   (`createHoldSlot`), and so does any other change to the same document —
 *   putting back the whole previous draft would drop that newer work.
 * - Leaving the editor closes the window and takes the toast with it, and
 *   so does opening the pre-publish check (`settleUndo`).
 * - Irreversible actions (discard every change, restore a version, start the
 *   site again) still ask first; they are not here.
 *
 * The timer is `lib/hold-undo.ts`, shared with Orders and Home.
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
}) {
    const slotRef = useRef<HoldSlot | null>(null);
    const watch = useRef<Watch | null>(null);
    const slot = () => (slotRef.current ??= createHoldSlot());
    // The top bar's Undo icon is pressable while the window is open (U46).
    const [undoOpen, setUndoOpen] = useState(false);
    const [redo, setRedo] = useState<Redo | null>(null);

    function hold(message: string, doc: Doc, before: unknown, put: () => void) {
        let toastId: ToastId | null = null;
        const w: Watch = {
            hold: null as unknown as Hold,
            doc,
            before,
            after: null,
            armed: false,
        };
        const held = slot().start({
            undo: () => {
                put();
                // What the action left, for Redo; read from this hold's own
                // watch, since the window has closed by now.
                if (w.armed) setRedo({ doc, value: w.after, restored: before });
            },
            onChange: (state) => {
                if (state.status === "held") return;
                // The window has closed, however it closed: an Undo left on
                // screen would do nothing.
                if (toastId !== null) dismissToast(toastId);
                if (watch.current?.hold === held) {
                    watch.current = null;
                    setUndoOpen(false);
                }
            },
        });
        w.hold = held;
        watch.current = w;
        setUndoOpen(true);
        // A new action: what was undone before it can't come back.
        setRedo(null);
        toastId = showUndo(message, () => void held.undo(), {
            duration: HOLD_UNDO_MS,
        });
    }

    useEffect(
        () => closeOnLaterChange(watch.current, "sections", sections),
        [sections],
    );
    useEffect(() => closeOnLaterChange(watch.current, "style", style), [style]);

    // Leaving the editor: nothing is waiting to be sent, so the hold just
    // ends, and its toast goes with the page it belonged to.
    useEffect(() => () => void slotRef.current?.leave(), []);

    const label = (section: Section) => SECTION_LABELS[section.type];
    // Redo lasts while the document is still what the Undo left (U46).
    const redoNow =
        redo !== null &&
        !readOnly &&
        (redo.doc === "sections" ? sections : style) === redo.restored
            ? redo
            : null;

    function moveWithUndo(from: number, to: number) {
        if (readOnly) return;
        const count = sections.length;
        if (from < 0 || from >= count || to < 0 || to >= count) return;
        if (from === to) return;
        const section = sections[from];
        const before = sections;
        moveTo(from, to);
        hold(
            `${label(section)} moved ${to < from ? "up" : "down"}`,
            "sections",
            before,
            () => {
                restoreSections(before);
                setSelectedIndex(from);
            },
        );
    }

    return {
        /** The Undo window is open: the top bar's Undo icon is pressable. */
        canUndo: undoOpen && !readOnly,
        /** Undo the held action: the same as the toast's Undo. */
        undo() {
            if (readOnly) return;
            void watch.current?.hold.undo();
        },
        /** Something Undo took back can be put back (More › Redo). */
        canRedo: redoNow !== null,
        /** Put back what Undo took back, until the next edit. */
        redo() {
            if (!redoNow) return;
            setRedo(null);
            if (redoNow.doc === "sections") {
                restoreSections(redoNow.value as Section[]);
            } else {
                setStyle(redoNow.value as SiteStyle);
            }
        },
        /**
         * Close the Undo window now and take its toast away. Opening the
         * pre-publish check does this: an Undo pressed behind the check
         * would change the draft the merchant is about to publish, and
         * Publish would put live the saved draft without it (review G-1).
         */
        settleUndo() {
            void slotRef.current?.commitNow();
        },
        removeAt(index: number) {
            if (readOnly || index < 0 || index >= sections.length) return;
            const section = sections[index];
            const before = sections;
            removeAt(index);
            setSelectedIndex(null);
            hold(
                `${label(section)} taken off this page`,
                "sections",
                before,
                () => {
                    restoreSections(before);
                    setSelectedIndex(index);
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
            if (readOnly) return;
            const before = sections;
            restoreSections(next);
            if (select) setSelectedIndex(select.after);
            hold(message, "sections", before, () => {
                restoreSections(before);
                if (select) setSelectedIndex(select.undone);
            });
        },
        moveTo: moveWithUndo,
        move: (index: number, delta: number) =>
            moveWithUndo(index, index + delta),
        toggleHidden(index: number) {
            if (readOnly || index < 0 || index >= sections.length) return;
            const section = sections[index];
            const before = sections;
            toggleHidden(index);
            hold(
                section.hidden
                    ? `${label(section)} is back on this page`
                    : `${label(section)} is hidden on this page`,
                "sections",
                before,
                () => restoreSections(before),
            );
        },
        resetStyle() {
            if (readOnly) return;
            const before = style;
            resetStyle();
            hold("Colours, type and spacing reset.", "style", before, () =>
                setStyle(before),
            );
        },
    };
}

export type EditorUndo = ReturnType<typeof useUndo>;

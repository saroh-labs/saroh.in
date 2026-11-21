"use client";

import type { Editor } from "@tiptap/react";
import { useCallback, useSyncExternalStore } from "react";

/**
 * Whether the post's body can be undone or redone, kept current as it
 * changes (editor audit, 21 Nov). The bar read `editor.can()` only when it
 * happened to draw, so Undo stayed grey after typing. Unlit on open: what
 * the editor was opened with is not a step.
 *
 * Its own subscription rather than `useEditorState`, whose store stays
 * with the first editor it is given (null, before Tiptap mounts).
 */
export function useCanUndo(editor: Editor | null): {
    undo: boolean;
    redo: boolean;
} {
    const subscribe = useCallback(
        (changed: () => void) => {
            if (!editor) return () => undefined;
            editor.on("transaction", changed);
            editor.on("create", changed);
            return () => {
                editor.off("transaction", changed);
                editor.off("create", changed);
            };
        },
        [editor],
    );
    // A string, so the same answer is the same snapshot.
    const now = useSyncExternalStore(
        subscribe,
        () =>
            editor?.isInitialized
                ? `${editor.can().undo()}|${editor.can().redo()}`
                : "false|false",
        () => "false|false",
    );
    return { undo: now.startsWith("true"), redo: now.endsWith("|true") };
}

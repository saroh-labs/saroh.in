import type { Editor } from "@tiptap/react";

const editorKeys = new WeakMap<Editor, number>();
let lastEditorKey = 0;

/**
 * A key per editor instance, so a remade editor remounts its surface.
 *
 * `useEditor` destroys its editor and makes a new one when its effects
 * disconnect and reconnect — a sheet React hides while a lazy part loads, a
 * post editor remounted when its first save moves it to the post's own
 * address. The surface's effects reconnect first, holding the destroyed
 * editor, and `useEditorState` keeps the store it built around it. Keyed by
 * instance, the new editor gets a fresh surface and a fresh store.
 */
export function editorKey(editor: Editor): number {
    let key = editorKeys.get(editor);
    if (key === undefined) {
        key = ++lastEditorKey;
        editorKeys.set(editor, key);
    }
    return key;
}

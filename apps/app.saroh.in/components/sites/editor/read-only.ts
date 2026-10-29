"use client";

import { createContext, useContext } from "react";

/**
 * The editor's one read-only switch (DEC-200): a Reviewer opens the real
 * editor and can change nothing. Decided on the server page
 * (`!site.can.edit`), provided once by `SiteEditor`, and read by every
 * control that writes. A new editor control that changes the draft, the
 * site or its pages asks `useEditorReadOnly()` and draws nothing when it
 * is true; `read-only.test.tsx` fails if it doesn't. Outside the editor
 * it is false.
 */
export const EditorReadOnly = createContext(false);

export function useEditorReadOnly(): boolean {
    return useContext(EditorReadOnly);
}

"use client";

import type { ReactNode } from "react";

import type { EditorModel } from "../shell/editor-model";

export interface PhoneShellProps {
    model: EditorModel;
    /** Today's phone top bar (`phone-top-bar.tsx`). */
    topBar: ReactNode;
    /** Today's phone body: the canvas, the pill and its sheets. */
    children: ReactNode;
}

/**
 * The phone editor with the Website area on (U46 stub; U49 fills it as
 * the `fix/WXN*` boards draw it: top bar ← Website · page · Ask AI ·
 * Preview, bottom bar Sections · Add · Brand · Publish). Until then it is
 * today's phone editor, unchanged: the bar, then the body.
 */
export function PhoneShell({ topBar, children }: PhoneShellProps) {
    return (
        <>
            {topBar}
            {children}
        </>
    );
}

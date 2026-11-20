"use client";

import type { EditorModel } from "../shell/editor-model";

/** The section image being replaced: which section, and which field. */
export interface PhotoTarget {
    /** The section's index on the open page. */
    index: number;
    /** The image field in the section's content, as the contract names it. */
    field: string;
}

export interface PhotoSheetProps {
    model: EditorModel;
    /** What is being replaced; null: the sheet is closed. */
    target: PhotoTarget | null;
    onClose: () => void;
}

/**
 * Replace a section's photo (U46 stub; U46d fills it as `fix/WXKMedia`
 * draws it: library, upload, crop and focus point, Describe the photo).
 * The inspector opens it; the stub draws nothing.
 */
export function PhotoSheet(_props: PhotoSheetProps) {
    return null;
}

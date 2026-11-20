"use client";

import type { EditorModel } from "../shell/editor-model";

/**
 * Whether the three-size preview is built. Until it is, Preview stays
 * today's in-place preview (the canvas with its tools put away, G5); U46f
 * sets it, and the shell then draws `PreviewFrames` in the canvas's place.
 */
export const PREVIEW_FRAMES_READY = false as boolean;

export interface PreviewFramesProps {
    model: EditorModel;
    /** Back to editing, with the same selection (Esc too). */
    onBack: () => void;
}

/**
 * Preview at three sizes (U46 stub; U46f fills it as `fix/WXMPreview`
 * draws it). Drawn by the shell in the canvas's place while
 * `model.viewport.previewing` and `PREVIEW_FRAMES_READY` are both true.
 */
export function PreviewFrames(_props: PreviewFramesProps) {
    return null;
}

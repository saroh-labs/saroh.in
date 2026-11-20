"use client";

import type { EditorModel } from "../shell/editor-model";

/**
 * Whether Find (⌘K) is built. The shell's More shows "Find" only when true,
 * so the stub never offers a menu item that does nothing; U46c sets it.
 */
export const COMMAND_MENU_READY = false as boolean;

export interface CommandMenuProps {
    model: EditorModel;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

/**
 * Find (⌘K) in the editor (U46 stub; U46c fills it as `fix/WXECommand`
 * draws it). The shell mounts it always and opens it from More › Find and
 * from ⌘K once `COMMAND_MENU_READY` is true; the stub draws nothing.
 */
export function CommandMenu(_props: CommandMenuProps) {
    return null;
}

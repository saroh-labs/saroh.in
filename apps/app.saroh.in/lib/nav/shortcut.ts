/**
 * The command menu's shortcut, as this keyboard says it: ⌘K on a Mac,
 * Ctrl K on Windows and Linux. The menu has always opened on either; only
 * the hint was Mac's.
 *
 * Pure: the caller says which platform it is (`isApplePlatform`).
 */

/** Whether the keyboard has a ⌘ key, from what the browser says it is. */
export function isApplePlatform(nav: {
    platform?: string;
    userAgent?: string;
}): boolean {
    return /Mac|iPhone|iPad|iPod/i.test(
        `${nav.platform ?? ""} ${nav.userAgent ?? ""}`,
    );
}

/** "⌘K" or "Ctrl K": what the tip shows. */
export function searchShortcut(apple: boolean): string {
    return apple ? "⌘K" : "Ctrl K";
}

/** "Command K" or "Control K": what a screen reader says. */
export function searchShortcutSpoken(apple: boolean): string {
    return apple ? "Command K" : "Control K";
}

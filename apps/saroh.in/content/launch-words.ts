import type { LaunchMode } from "@/lib/links";

/**
 * Words that depend on the site's launch switch (DEC-137, with DEC-135 and
 * DEC-136): while the site is in waitlist mode nothing about Saroh's plans,
 * prices or limits is drawn. A line, a card or a clause marked `openOnly`
 * is content, so it comes back when `NEXT_PUBLIC_LAUNCH_MODE` is `open`
 * with no change to a component.
 */
export interface OpenOnly {
    /** Drawn only once the launch switch is open. */
    openOnly?: boolean;
}

/** The items a page draws in `mode`: everything but `openOnly` before launch. */
export function drawnIn<T extends OpenOnly>(
    items: readonly T[],
    mode: LaunchMode,
): T[] {
    return items.filter((item) => mode === "open" || !item.openOnly);
}

/** One line, said two ways: before launch and after. */
export interface ModeWords {
    waitlist: string;
    open: string;
}

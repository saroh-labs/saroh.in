"use client";

import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

import { cn } from "../../lib/utils";

/** The mounted flag never changes after hydration, so there is nothing to subscribe to. */
const subscribeToNothing = () => () => undefined;

/**
 * The design's theme pill: a light/dark flip that starts out following the
 * system and says so.
 *
 * Three states, two of them visible. Until someone touches it the theme is
 * `system`, and the control reports that in its accessible name — "Dark,
 * following your system. Switch to light." — rather than pretending a choice
 * was made. Pressing it makes an explicit choice, which is what someone
 * reaching for a toggle wants; the workspace's own Appearance menu is where
 * "System" can be chosen back deliberately.
 *
 * It renders nothing until mounted. `useTheme` cannot know the resolved theme
 * during SSR, so a label rendered on the server is a coin flip that hydrates
 * into a mismatch — and this control's whole job is to state the current
 * state correctly.
 */
export function ThemeToggle({ className }: { className?: string }) {
    const { resolvedTheme, theme, setTheme } = useTheme();
    // `false` until the client takes over, without a setState in an effect —
    // the same shape `ViewerDate` uses for the viewer's timezone. The server
    // snapshot is what the hydration render sees, so both sides agree by
    // construction rather than by suppressing a warning.
    const mounted = useSyncExternalStore(
        subscribeToNothing,
        () => true,
        () => false,
    );

    if (!mounted) {
        // Holds the space so the header does not jump when the label arrives.
        return <span aria-hidden className="h-8 w-[84px]" />;
    }

    const isDark = resolvedTheme === "dark";
    const following = theme === "system" || theme === undefined;

    return (
        <button
            type="button"
            onClick={() => setTheme(isDark ? "light" : "dark")}
            aria-label={
                `${isDark ? "Dark" : "Light"}` +
                `${following ? ", following your system" : ""}. ` +
                `Switch to ${isDark ? "light" : "dark"}.`
            }
            className={cn(
                "inline-flex h-8 items-center gap-[7px] rounded-full border border-border bg-card px-3 text-[12px] font-medium text-neutral-600 transition-colors duration-fast hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:text-muted-foreground dark:hover:text-foreground",
                className,
            )}
        >
            <svg
                aria-hidden
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-[14px] shrink-0"
            >
                {isDark ? (
                    <path d="M20 14.5 A8.5 8.5 0 0 1 9.5 4 A8.5 8.5 0 1 0 20 14.5 Z" />
                ) : (
                    <>
                        <path d="M12 17 A5 5 0 1 0 12 7 A5 5 0 0 0 12 17 Z" />
                        <path d="M12 2.5 V4.5 M12 19.5 V21.5 M2.5 12 H4.5 M19.5 12 H21.5 M5.3 5.3 L6.7 6.7 M17.3 17.3 L18.7 18.7 M18.7 5.3 L17.3 6.7 M6.7 17.3 L5.3 18.7" />
                    </>
                )}
            </svg>
            {isDark ? "Dark" : "Light"}
        </button>
    );
}

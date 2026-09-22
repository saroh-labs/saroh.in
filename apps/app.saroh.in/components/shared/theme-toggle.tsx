"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

/** The mounted flag never changes after hydration, so there is nothing to subscribe to. */
const subscribeToNothing = () => () => undefined;

/**
 * Light or dark, one press, in the top bar.
 *
 * The three-way choice already lives in the account menu (Appearance:
 * System / Dark / Light) and stays there — that is where someone goes to say
 * "follow my machine from now on". This is the other thing people want from a
 * theme control, which is to flip it RIGHT NOW because the room changed, and
 * which is not worth opening a menu and a submenu for.
 *
 * The two write the same `next-themes` value, so they cannot disagree: flip
 * here and the menu reads "Dark" afterwards.
 *
 * ## Why this exists here and not on the account screens
 *
 * A control like this came off `accounts.saroh.in` deliberately — see the
 * note in `@saroh/ui/split-shell`. The reason was storage, not taste:
 * `next-themes` keeps the choice in `localStorage`, which is per-origin, so a
 * choice made on the accounts host never reached this one. Inside the
 * workspace there is one origin, so the choice persists, survives navigation,
 * and is the same choice the account menu shows. What was incoherent there is
 * ordinary here.
 *
 * Pressing it makes the theme explicit, which is what someone reaching for a
 * toggle means. Getting back to "follow my system" is the menu's job, and the
 * accessible name says which of the two states is current so the control is
 * never ambiguous about what it is reporting versus what it will do.
 */
export function ThemeToggle() {
    const { resolvedTheme, theme, setTheme } = useTheme();
    // `false` until the client takes over, without a setState in an effect.
    // `useTheme` cannot know the resolved theme during SSR, so an icon chosen
    // on the server is a coin flip that hydrates into a mismatch.
    const mounted = useSyncExternalStore(
        subscribeToNothing,
        () => true,
        () => false,
    );

    if (!mounted) {
        // Holds the space so the top bar does not shift when the icon arrives.
        return <span aria-hidden className="size-8 coarse:size-11" />;
    }

    const isDark = resolvedTheme === "dark";
    const following = theme === "system" || theme === undefined;
    const Icon = isDark ? Moon : Sun;

    return (
        <button
            type="button"
            onClick={() => setTheme(isDark ? "light" : "dark")}
            aria-label={
                `${isDark ? "Dark" : "Light"}` +
                `${following ? ", following your system" : ""}. ` +
                `Switch to ${isDark ? "light" : "dark"}.`
            }
            title={`Switch to ${isDark ? "light" : "dark"}`}
            className="inline-flex size-8 items-center justify-center rounded-lg text-neutral-700 transition-colors duration-fast hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background coarse:size-11 dark:text-foreground"
        >
            <Icon className="size-4" />
        </button>
    );
}

import type { ClassValue } from "clsx";
import { clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * `cn()` for the Marketing Site V2 components — `@saroh/ui/lib/utils`'s, taught
 * this app's `mk-*` theme keys (tailwind.config.ts).
 *
 * Why not the shared one: tailwind-merge does not read the Tailwind config, so
 * it took `text-mk-note` for a colour and silently dropped it whenever a
 * colour class followed (`text-mk-note text-muted-foreground` lost its size).
 * Registering the keys keeps sizes, radii and widths in their own groups.
 * Product apps have no `mk-*` keys, so `@saroh/ui` stays as it is.
 *
 * One more trap it cannot fix: tailwind-merge 3 follows Tailwind 4, where
 * `outline` is a width, so `outline outline-2` merges to `outline-2` and the
 * outline loses its style. V2 focus rings write
 * `focus-visible:[outline-style:solid]` instead of `focus-visible:outline`.
 */
const twMerge = extendTailwindMerge({
    extend: {
        classGroups: {
            "font-size": [
                {
                    text: [
                        "mk-hero",
                        "mk-display",
                        "mk-h2",
                        "mk-h2-sm",
                        "mk-band",
                        "mk-h3",
                        "mk-price",
                        "mk-card-lg",
                        "mk-card",
                        "mk-lead",
                        "mk-intro",
                        "mk-band-body",
                        "mk-body",
                        "mk-faq",
                        "mk-card-body",
                        "mk-nav",
                        "mk-note",
                        "mk-eyebrow",
                    ],
                },
            ],
            "max-w": [{ "max-w": ["mk-page"] }],
            rounded: [
                { rounded: ["mk-control", "mk-btn", "mk-card", "mk-band"] },
            ],
            shadow: [
                {
                    shadow: [
                        "mk-card",
                        "mk-shot",
                        "mk-hero",
                        "mk-menu",
                        "mk-zoom",
                    ],
                },
            ],
        },
        theme: {
            spacing: ["mk-gutter", "mk-nav", "mk-band"],
        },
    },
});

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

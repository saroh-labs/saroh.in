import * as React from "react";

export interface WordmarkProps extends React.HTMLAttributes<HTMLSpanElement> {
    /** Optional muted per-app suffix, e.g. "Docs", "Help", "UI". */
    suffix?: string;
}

/**
 * The canonical Saroh brand wordmark: "Saroh" in the midnight brand gradient
 * with an optional muted per-app suffix. Styled with INLINE styles only (no
 * Tailwind) so it renders identically in every app — shadcn/Tailwind apps,
 * Nextra docs, or a plain marketing page — without any per-app setup.
 *
 * Every colour is `var(--token, <literal fallback>)`. In an app that loads
 * @saroh/ui tokens the wordmark tracks the live theme (including dark mode);
 * in one that does not (Nextra docs/help), the fallback renders the identical
 * colour. That is why this file no longer needs manual hex syncing — the
 * previous hardcoded blue silently survived the rebrand and left every logo on
 * the old palette.
 */
export function Wordmark({ suffix, style, ...props }: WordmarkProps) {
    return (
        <span
            style={{
                display: "inline-flex",
                alignItems: "baseline",
                gap: "0.4ch",
                fontFamily:
                    "var(--font-display, ui-sans-serif, system-ui, sans-serif)",
                fontWeight: 700,
                fontSize: "1.125rem",
                letterSpacing: "-0.03em",
                ...style,
            }}
            {...props}
        >
            <span
                style={{
                    // Solid, and reading the SEMANTIC brand token rather than
                    // a ramp step: skins redefine `--brand`, so the wordmark
                    // follows whichever world is selected. The old gradient
                    // pinned it to a ramp no skin overrides, which is why it
                    // stayed navy while everything around it changed.
                    color: "hsl(var(--brand, 222 58% 22%))",
                }}
            >
                Saroh
            </span>
            {suffix ? (
                <span
                    style={{
                        fontWeight: 500,
                        color: "hsl(var(--muted-foreground, 222 10% 40%))",
                    }}
                >
                    {suffix}
                </span>
            ) : null}
        </span>
    );
}

export default Wordmark;

import * as React from "react";

export interface WordmarkProps extends React.HTMLAttributes<HTMLSpanElement> {
    /** Optional muted per-app suffix, e.g. "Docs", "Help", "UI". */
    suffix?: string;
    /** The symbol alone, for rails and tight spaces. It keeps "Saroh" as its accessible name. */
    symbolOnly?: boolean;
}

/**
 * The single stroke: one path that folds twice, and a Saffron cursor dot. The
 * geometry is the brand file's 64-unit master; never re-draw it. Below 20px the
 * dot is dropped (brand file §1).
 */
export function SarohSymbol({
    size = 24,
    style,
    ...props
}: Omit<React.SVGProps<SVGSVGElement>, "width" | "height"> & {
    /** Pixels, or any CSS length (the lockup passes `1.385em` so it scales with its type). */
    size?: number | string;
}) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 64 64"
            fill="none"
            aria-hidden
            focusable="false"
            style={{ flex: "none", ...style }}
            {...props}
        >
            <path
                d="M44 11 L27 26 L40 37 L20 53"
                // The page's ink: Ink 900 on Paper, Paper-side on Ink. Never
                // Saffron — the stroke measures 2.5:1 on Paper in Saffron.
                stroke="hsl(var(--foreground, 60 4% 11%))"
                strokeWidth={8}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            {typeof size === "string" || size >= 20 ? (
                <circle
                    cx="50"
                    cy="48"
                    r="5.6"
                    // `--highlight` is Saffron 500 on light and Saffron light
                    // (#F0A92B) on dark — exactly the dot's two cuts.
                    fill="hsl(var(--highlight, 36 82% 47%))"
                />
            ) : null}
        </svg>
    );
}

/**
 * The canonical Saroh lockup: the symbol, then "Saroh" in Plus Jakarta Sans
 * SemiBold, title case, never all caps, with an optional muted per-app suffix.
 * Styled with INLINE styles only (no Tailwind) so it renders identically in
 * every app — shadcn/Tailwind apps, Nextra docs, or a plain marketing page —
 * without any per-app setup.
 *
 * Every colour is `var(--token, <literal fallback>)`, so it tracks the live
 * theme (including dark mode) where @saroh/ui tokens are loaded, and falls back
 * to the brand's light values where they are not.
 *
 * Proportions are the brand file's primary lockup: the symbol is 1.385× the
 * type size and the gap is 0.28× the symbol. Below 104px wide, use
 * `symbolOnly`.
 */
export function Wordmark({
    suffix,
    symbolOnly = false,
    style,
    ...props
}: WordmarkProps) {
    return (
        <span
            style={{
                display: "inline-flex",
                alignItems: "center",
                // In em, so a call site that sets its own fontSize scales the
                // symbol and the gap with the type.
                gap: "0.388em",
                fontFamily:
                    "var(--font-sans, ui-sans-serif, system-ui, sans-serif)",
                fontWeight: 600,
                fontSize: "1.125rem",
                lineHeight: 1,
                letterSpacing: "-0.025em",
                ...style,
            }}
            {...(symbolOnly ? { role: "img", "aria-label": "Saroh" } : {})}
            {...props}
        >
            <SarohSymbol size="1.385em" />
            {symbolOnly ? null : (
                <span style={{ color: "hsl(var(--foreground, 60 4% 11%))" }}>
                    Saroh
                </span>
            )}
            {suffix && !symbolOnly ? (
                <span
                    style={{
                        fontWeight: 500,
                        color: "hsl(var(--muted-foreground, 42 9% 39%))",
                    }}
                >
                    {suffix}
                </span>
            ) : null}
        </span>
    );
}

export default Wordmark;

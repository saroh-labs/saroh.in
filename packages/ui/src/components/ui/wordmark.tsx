import * as React from "react";

import {
    SYMBOL_PATH,
    WORDMARK_PATH,
    WORDMARK_VIEWBOX,
} from "../../lib/wordmark-geometry";

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
    // The mark thickens as it shrinks (brand file §20): at 32px and below the
    // stroke is 9 and the dot r6, so its optical weight holds.
    const small = typeof size === "number" && size <= 32;
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
                d={SYMBOL_PATH}
                // The page's ink: Ink 900 on Paper, Paper-side on Ink. Never
                // Saffron — the stroke measures 2.5:1 on Paper in Saffron.
                stroke="hsl(var(--foreground, 60 4% 11%))"
                strokeWidth={small ? 9 : 8}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            {typeof size === "string" || size >= 20 ? (
                <circle
                    cx="50"
                    cy="48"
                    r={small ? 6 : 5.6}
                    // `--highlight` is Saffron 500 on light and Saffron light
                    // (#F0A92B) on dark — exactly the dot's two cuts.
                    fill="hsl(var(--highlight, 36 82% 47%))"
                />
            ) : null}
        </svg>
    );
}

/**
 * The canonical Saroh lockup: the symbol, then the outlined "Saroh", title
 * case, never all caps, with an optional muted per-app suffix in Geist.
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
                position: "relative",
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
                <>
                    <svg
                        viewBox={WORDMARK_VIEWBOX}
                        // 769 font units of a 1000-unit em: the letters sit at
                        // the size live text would set them.
                        style={{
                            height: "0.769em",
                            width: "auto",
                            flex: "none",
                        }}
                        aria-hidden
                        focusable="false"
                    >
                        <path
                            d={WORDMARK_PATH}
                            fill="hsl(var(--foreground, 60 4% 11%))"
                        />
                    </svg>
                    {/* The accessible name is the word itself. */}
                    <span style={VISUALLY_HIDDEN}>Saroh</span>
                </>
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

const VISUALLY_HIDDEN: React.CSSProperties = {
    position: "absolute",
    width: 1,
    height: 1,
    overflow: "hidden",
    clipPath: "inset(50%)",
    whiteSpace: "nowrap",
};

export default Wordmark;

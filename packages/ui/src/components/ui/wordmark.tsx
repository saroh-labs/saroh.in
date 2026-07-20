import * as React from "react";

export interface WordmarkProps extends React.HTMLAttributes<HTMLSpanElement> {
    /** Optional muted per-app suffix, e.g. "Docs", "Help", "UI". */
    suffix?: string;
}

/**
 * The canonical Saroh brand wordmark: "Saroh" in the blue brand gradient with
 * an optional muted per-app suffix. Styled with INLINE styles only (no Tailwind,
 * no CSS-var dependency) so it renders identically in every app — shadcn/Tailwind
 * apps, Nextra docs, or a plain marketing page — without any per-app setup.
 *
 * Keep this the single source of truth for the wordmark. Apps that can't import
 * from `@saroh/ui` (e.g. the Nextra docs/help layouts and the marketing site)
 * inline the same markup; if you change the brand here, update those too.
 */
export function Wordmark({ suffix, style, ...props }: WordmarkProps) {
    return (
        <span
            style={{
                display: "inline-flex",
                alignItems: "baseline",
                gap: "0.4ch",
                fontWeight: 700,
                fontSize: "1.125rem",
                letterSpacing: "-0.02em",
                ...style,
            }}
            {...props}
        >
            <span
                style={{
                    backgroundImage:
                        "linear-gradient(90deg, #3b82f6 0%, #1d4ed8 100%)",
                    WebkitBackgroundClip: "text",
                    backgroundClip: "text",
                    color: "transparent",
                }}
            >
                Saroh
            </span>
            {suffix ? (
                <span style={{ fontWeight: 500, color: "#71717a" }}>
                    {suffix}
                </span>
            ) : null}
        </span>
    );
}

export default Wordmark;

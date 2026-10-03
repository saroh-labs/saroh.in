import { ImageResponse } from "next/og";

import { OG_SIZE } from "@/lib/seo";

/**
 * The share card every page's `opengraph-image.tsx` draws (plan U26): Paper,
 * the Saroh mark, a small eyebrow naming the page and its headline in Ink.
 * Light only, like the site. Built at build time, so no request ever renders
 * one; Twitter reuses the Open Graph image.
 *
 * Colours are the site's tokens written out (an image has no CSS variables):
 * Paper #F5F2EC, Ink #1C1C1A, Saffron 500 #D98A15, Ink 500 #6B6862.
 */
export { HOME_OG_ALT, OG_CONTENT_TYPE, OG_SIZE } from "@/lib/seo";

const PAPER = "#F5F2EC";
const INK = "#1C1C1A";
const SAFFRON = "#D98A15";
const QUIET = "#6B6862";

export interface OgCard {
    /** What kind of page: "Features · Orders", "Pricing". */
    eyebrow?: string;
    /** The page's headline. */
    title: string;
}

/** The mark from `app/icon.svg`: the Ink tile, the Paper stroke, the Saffron dot. */
function Mark({ size }: { size: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 64 64">
            <rect width="64" height="64" rx="16" fill={INK} />
            <g transform="translate(12 12) scale(0.625)" fill="none">
                <path
                    d="M44 11 L27 26 L40 37 L20 53"
                    stroke={PAPER}
                    strokeWidth="9"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
                <circle cx="50" cy="48" r="6" fill={SAFFRON} />
            </g>
        </svg>
    );
}

export function ogCard({ eyebrow, title }: OgCard): ImageResponse {
    return new ImageResponse(
        <div
            style={{
                width: "100%",
                height: "100%",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                background: PAPER,
                color: INK,
                padding: "72px 80px",
            }}
        >
            <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
                <Mark size={64} />
                <span
                    style={{
                        fontSize: 40,
                        fontWeight: 700,
                        letterSpacing: "-0.02em",
                    }}
                >
                    Saroh
                </span>
            </div>
            <div
                style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 22,
                }}
            >
                {eyebrow ? (
                    <span
                        style={{
                            fontSize: 26,
                            fontWeight: 600,
                            letterSpacing: "0.08em",
                            textTransform: "uppercase",
                            color: SAFFRON,
                        }}
                    >
                        {eyebrow}
                    </span>
                ) : null}
                <span
                    style={{
                        fontSize: title.length > 48 ? 64 : 76,
                        fontWeight: 700,
                        lineHeight: 1.08,
                        letterSpacing: "-0.03em",
                        maxWidth: 1000,
                    }}
                >
                    {title}
                </span>
            </div>
            <span style={{ fontSize: 26, color: QUIET }}>saroh.in</span>
        </div>,
        OG_SIZE,
    );
}

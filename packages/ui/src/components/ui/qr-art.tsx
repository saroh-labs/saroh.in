import * as React from "react";

import type { QrArt as QrArtData } from "../../lib/qr-art";
import {
    QR_GROUND,
    QR_QUIET_ZONE,
    QR_TILE_FILL,
    QR_TILE_TEXT,
    qrInitials,
    qrLogoGeometry,
} from "../../lib/qr-art";
import { cn } from "../../lib/utils";

/** A logo for the centre box: an image (URL or data URL), or initials. */
export type QrArtLogo = { src: string } | { initials: string };

export interface QrArtProps extends Omit<
    React.SVGProps<SVGSVGElement>,
    "aria-label" | "color" | "role"
> {
    /** From `qrArt()` in `@saroh/ui/lib/qr-art`. */
    art: QrArtData;
    /** The code's colour; the caller checks it with `tooLightToScan`. */
    color: string;
    /** Drawn in the centre box when the art has one. */
    logo?: QrArtLogo;
    /** What the code opens, for someone who cannot see it. */
    "aria-label": string;
}

/**
 * A QR code on screen, drawn from `qrArt()`. Presentational: it makes no
 * code of its own and holds no state. The ground is always white and the
 * initials tile always Ink on it, in both themes, because a code has to
 * scan whatever the page around it looks like. It fills its parent's
 * width and stays square; size it with `className`.
 */
export function QrArt({
    art,
    color,
    logo,
    className,
    "aria-label": ariaLabel,
    ...props
}: QrArtProps) {
    const clipId = React.useId();
    const side = art.n + QR_QUIET_ZONE * 2;
    const g = qrLogoGeometry(art);
    const initials =
        logo && "initials" in logo ? qrInitials(logo.initials) : "";

    return (
        <svg
            viewBox={art.viewBox}
            role="img"
            // Its shape is the link it holds: left out of a session
            // recording (frontend-design-system.md → Session recordings).
            data-ph-block=""
            aria-label={ariaLabel}
            focusable="false"
            shapeRendering="geometricPrecision"
            data-qr-art={art.n === 0 ? "empty" : "code"}
            className={cn("block aspect-square w-full", className)}
            {...props}
        >
            <rect
                x={-QR_QUIET_ZONE}
                y={-QR_QUIET_ZONE}
                width={side}
                height={side}
                fill={QR_GROUND}
            />
            <path d={art.dots} fill={color} />
            <path d={art.eyes} fill={color} fillRule="evenodd" />
            {g ? (
                <g data-qr-logo-box="">
                    <rect
                        x={g.box.x}
                        y={g.box.y}
                        width={g.box.size}
                        height={g.box.size}
                        rx={g.box.rx}
                        fill={QR_GROUND}
                    />
                    {logo && "src" in logo && logo.src !== "" ? (
                        <>
                            <clipPath id={clipId}>
                                <rect
                                    x={g.tile.x}
                                    y={g.tile.y}
                                    width={g.tile.size}
                                    height={g.tile.size}
                                    rx={g.tile.imageRx}
                                />
                            </clipPath>
                            <image
                                href={logo.src}
                                x={g.tile.x}
                                y={g.tile.y}
                                width={g.tile.size}
                                height={g.tile.size}
                                preserveAspectRatio="xMidYMid meet"
                                clipPath={`url(#${clipId})`}
                            />
                        </>
                    ) : null}
                    {initials !== "" ? (
                        <>
                            <rect
                                x={g.tile.x}
                                y={g.tile.y}
                                width={g.tile.size}
                                height={g.tile.size}
                                rx={g.tile.rx}
                                fill={QR_TILE_FILL}
                            />
                            <text
                                x={g.text.x}
                                y={g.text.y}
                                fontSize={g.text.size}
                                fontWeight={600}
                                fill={QR_TILE_TEXT}
                                textAnchor="middle"
                                dominantBaseline="central"
                                style={{
                                    fontFamily:
                                        "var(--font-display), system-ui, sans-serif",
                                }}
                            >
                                {initials}
                            </text>
                        </>
                    ) : null}
                </g>
            ) : null}
        </svg>
    );
}

"use client";

import type { LookId } from "@saroh/block-contract";
import { LOOKS } from "@saroh/block-contract";
import { fontPairStacks } from "@saroh/site-blocks";
import { cn } from "@saroh/ui/lib/utils";
import Image from "next/image";

import type { LookThumbnailImage } from "@/lib/sites/look-thumbnails";
import type { SiteStyle, SiteStyleOptions } from "@/lib/sites/style";
import { inLook, resolveStyleVariables } from "@/lib/sites/style";
import { useSiteFaces } from "./site-faces";

/**
 * A look on a phone, small. The renderer's own picture of the site's
 * template in that look when one was captured
 * (`lib/sites/look-thumbnails.ts`); otherwise drawn here in the business's
 * own colours, as the look makes them safe, with the look's corners and
 * heading face, so the four read apart at a glance.
 */
export function LookThumbnail({
    look,
    style,
    options,
    image,
    className,
}: {
    look: LookId | null;
    style: SiteStyle;
    options: SiteStyleOptions;
    image?: LookThumbnailImage;
    /** Its size where the default phone shape doesn't fit (the Brand tab). */
    className?: string;
}) {
    const faces = useSiteFaces();
    const frame = cn(
        "relative h-[88px] w-[50px] shrink-0 overflow-hidden rounded-md border border-border-strong",
        className,
    );
    if (image) {
        return (
            // Decorative: the choice's name and line say what it is.
            <Image
                src={image.src}
                alt=""
                aria-hidden
                width={image.width}
                height={image.height}
                sizes={className ? "240px" : "50px"}
                className={cn(frame, "object-cover object-top")}
            />
        );
    }

    const vars = resolveStyleVariables(inLook(style, look), options);
    const hsl = (name: string, fallback: string) =>
        `hsl(${vars[name] ?? fallback})`;
    const tokens = look ? LOOKS[look].tokens : null;
    // The site's corners at the picture's scale: a pill stays a pill, a
    // square corner square.
    const small = (px: number) => (px >= 999 ? 999 : Math.round(px / 6));
    // An older style may not carry the slider at all.
    const own = style.scalars.cornerRadius;
    const corner = Number.isFinite(own) ? own : 2;
    const radius = small(tokens ? tokens.radius : corner);
    const photoRadius = small(tokens ? tokens.radiusPhoto : corner);
    const heading = fontPairStacks(
        look ? LOOKS[look].fontPair : style.fontPair,
        faces,
    )?.heading;

    return (
        <span
            aria-hidden
            data-look-thumbnail={look ?? "classic"}
            className={cn(frame, "flex flex-col gap-1 p-1.5")}
            style={{ background: hsl("--site-bg", "0 0% 100%") }}
        >
            <span
                className="text-[13px] leading-none"
                style={{
                    color: hsl("--site-fg", "24 10% 10%"),
                    fontFamily: heading,
                }}
            >
                Aa
            </span>
            <span
                className="block h-[30px] w-full"
                style={{
                    background: hsl("--site-accent-soft", "24 6% 90%"),
                    borderRadius: photoRadius,
                }}
            />
            <span
                className="block h-0.5 w-4/5 rounded-full opacity-50"
                style={{ background: hsl("--site-body", "24 6% 34%") }}
            />
            <span
                className="block h-0.5 w-3/5 rounded-full opacity-50"
                style={{ background: hsl("--site-body", "24 6% 34%") }}
            />
            <span
                className="mt-auto block h-2 w-full"
                style={{
                    background: hsl("--site-accent", "24 10% 10%"),
                    borderRadius: radius,
                }}
            />
        </span>
    );
}

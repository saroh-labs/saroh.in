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

/** The business's name and up to two of its headings, for a look card. */
export interface LookWords {
    name: string;
    headings: string[];
}

/** The open page's first two headings, as a look card shows them. */
export function lookWords(
    name: string,
    sections: readonly { content: unknown }[],
): LookWords {
    const headings = sections
        .map((s) => (s.content as { heading?: unknown } | null)?.heading)
        .filter((h): h is string => typeof h === "string" && h.trim() !== "")
        .slice(0, 2);
    return { name, headings };
}

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
    words,
    className,
}: {
    look: LookId | null;
    style: SiteStyle;
    options: SiteStyleOptions;
    image?: LookThumbnailImage;
    /**
     * The business's own name and headings (`WXBBrand`): drawn in place of
     * "Aa" and the grey bars, and over a captured picture, which shows the
     * template's sample words.
     */
    words?: LookWords;
    /** Its size where the default phone shape doesn't fit (the Brand tab). */
    className?: string;
}) {
    const faces = useSiteFaces();
    const frame = cn(
        "relative h-[88px] w-[50px] shrink-0 overflow-hidden rounded-md border border-border-strong",
        className,
    );
    if (image && !words) {
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
            {/* The business's heading at a readable 15px in the look's own
                face (B2/B5, `WXBBrand`); the name alone when it has none. */}
            <span
                className={cn(
                    "shrink-0 leading-tight",
                    words
                        ? "truncate text-[15px] font-semibold"
                        : "text-[13px]",
                )}
                style={{
                    color: hsl("--site-fg", "24 10% 10%"),
                    fontFamily: heading,
                }}
                data-look-words={words ? "" : undefined}
            >
                {words?.headings[0] ?? (words ? words.name : "Aa")}
            </span>
            {/* The picture gives way first on a short (64px) card. */}
            <span
                className="block h-[30px] min-h-0 w-full"
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

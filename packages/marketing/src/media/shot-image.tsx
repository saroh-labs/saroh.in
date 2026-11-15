import { preload } from "react-dom";

import { cn } from "../cn";
import type { Shot } from "./shot";

/**
 * One screenshot, or — until it has been captured — a neutral frame of the
 * same shape, so the page's layout already matches the design. The placeholder
 * keeps the alt as its accessible name.
 *
 * The picture is a plain `<img>` over files: the capture and its smaller
 * copies in a `srcset` (`Shot.srcSet`, the site's), with `sizes` saying how
 * wide this place draws it. `width` and `height` hold its space before it
 * arrives. A `priority` shot (a page's hero, its largest thing on screen)
 * is fetched at once and preloaded from the document's head; every other
 * one waits until it is near the screen. `priorityFrom` keeps that to wide
 * screens (a media query): home's hero shot is the largest thing on a desk
 * but sits under the words on a phone, where fetching it first held the
 * words back. Not `next/image`: on Cloudflare its
 * `/_next/image` re-encodes on every request and sends nothing a browser
 * may keep.
 */
export function ShotImage({
    shot,
    alt,
    sizes,
    priority = false,
    priorityFrom,
    className,
}: {
    shot: Shot;
    alt: string;
    sizes: string;
    priority?: boolean;
    /** Preload it at high priority only where this media query matches. */
    priorityFrom?: string;
    className?: string;
}) {
    if (shot.src === null) {
        return (
            <span
                role="img"
                aria-label={alt}
                style={{ aspectRatio: `${shot.width} / ${shot.height}` }}
                className={cn(
                    "grid w-full min-w-[min(100%,320px)] place-items-center bg-muted",
                    className,
                )}
            />
        );
    }
    const { src, srcSet } = shot;
    const phone = shot.phone?.src ? shot.phone : undefined;
    if (priority) {
        preload(src, {
            as: "image",
            imageSrcSet: srcSet,
            imageSizes: srcSet ? sizes : undefined,
            fetchPriority: "high",
            media: phone
                ? `${PHONE_UP}${priorityFrom ? ` and ${priorityFrom}` : ""}`
                : priorityFrom,
        });
    }
    const img = (
        // Files with their own srcset; next/image's optimizer is what this replaces.
        <img
            // `sizes` and `srcSet` before `src`: a browser that reads `src`
            // first starts on the full-size capture.
            sizes={srcSet ? sizes : undefined}
            srcSet={srcSet}
            src={src}
            alt={alt}
            width={shot.width}
            height={shot.height}
            loading={priority ? "eager" : "lazy"}
            fetchPriority={priority && !priorityFrom ? "high" : undefined}
            decoding="async"
            // Its blurred stand-in shows until the picture paints over it.
            style={
                shot.placeholder
                    ? {
                          backgroundImage: `url(${shot.placeholder})`,
                          backgroundSize: "cover",
                      }
                    : undefined
            }
            className={cn("block h-auto w-full", className)}
        />
    );
    if (!phone?.src) return img;
    return (
        <picture>
            <source
                media={PHONE}
                sizes={phone.srcSet ? "100vw" : undefined}
                srcSet={phone.srcSet ?? phone.src}
                width={phone.width}
                height={phone.height}
            />
            {img}
        </picture>
    );
}

/** Where a shot's `phone` capture is drawn instead. */
const PHONE = "(max-width: 639px)";
const PHONE_UP = "(min-width: 640px)";

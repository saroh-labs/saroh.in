import { placeholderDataUrl, storedSrcSet } from "@saroh/block-contract";
import { preload } from "react-dom";

import { resizedSources } from "./image-sizes";

/**
 * How a picture on a merchant's page is loaded: one rule for every block.
 *
 * - `first-hero`: the photo the page opens on. Fetched at once and ahead of
 *   everything else (`fetchPriority="high"`): it is what the visitor is
 *   waiting to see, and what a phone on a slow connection draws last
 *   otherwise.
 * - `above`: likely on the first screen (a product's main photo, the lead
 *   card of a grid). Fetched at once.
 * - `below` (the default): anything further down. Fetched only as the
 *   visitor nears it (`loading="lazy"`), so a long page costs a phone what
 *   it shows, not everything it holds.
 *
 * Every picture is decoded off the main thread (`decoding="async"`), so a
 * large photo never holds up a tap.
 *
 * Spread onto a plain `<img>`: `<img src=… alt=… {...siteImage()} />`. The
 * `<img>` still needs its `width` and `height` (or a box with an aspect
 * ratio around it), so the page doesn't jump when the photo arrives.
 *
 * Sized for the screen (#1043): pass the photo as the second argument,
 * `siteImage(place, { src, width, sizes })`, and a photo from the business's
 * public media comes back with `src`, `srcSet` and `sizes` pointing at the
 * site's image route (`/_img/<width>/<key>`, answered by the Worker through
 * Cloudflare Images, as AVIF or WebP). The ladder and the rules for which
 * photos qualify are `image-sizes.ts`. `width` is the photo's own width
 * when the snapshot has it, so no version wider than the file is offered;
 * `sizes` is how wide the block draws it.
 *
 * Off where the build has no media address (`NEXT_PUBLIC_SITE_MEDIA_URL`,
 * set only in the Worker's `wrangler.jsonc`, where the `IMAGES` binding is):
 * `next dev`, `next start`, the e2e stack and the editor's preview. There,
 * and for any photo that isn't the business's own (an outside address, an
 * SVG), nothing is added and the `<img>` keeps the `src` it was given:
 * exactly the markup it had before.
 *
 * Copies made at upload come first (DEC-246): a photo whose snapshot names
 * the widths of its stored smaller copies (`widths`) gets its `srcSet`
 * straight from them, on the media domain, with no Worker or Cloudflare
 * Images. A photo with a `placeholder` (its ThumbHash) gets its blur as a
 * tiny PNG in the `<img>`'s background, drawn here on the server, so a
 * lazy photo shows it until it paints, without script. A photo with
 * neither keeps exactly the markup above.
 *
 * The first hero is also preloaded from the head (React's `preload`, with
 * the same `srcset` and `sizes`), so the browser starts on it before it
 * reaches the `<img>`.
 */
export type ImagePlace = "first-hero" | "above" | "below";

export interface SiteImageProps {
    loading: "eager" | "lazy";
    decoding: "async";
    fetchPriority?: "high";
    src?: string;
    srcSet?: string;
    sizes?: string;
    /**
     * The focus point as `object-position`, only when the photo has one;
     * its blur as the background, only when it has a placeholder.
     */
    style?: {
        objectPosition?: string;
        backgroundImage?: string;
        backgroundSize?: string;
        backgroundPosition?: string;
    };
}

/** The photo an `<img>` draws, for sizing it. */
export interface SiteImageSource {
    /** The address the `<img>` was given. */
    src: string | null | undefined;
    /** The file's own width in pixels, when known. */
    width?: number | null;
    /** How wide the block draws it (the `sizes` attribute); `100vw` unsaid. */
    sizes?: string;
    /**
     * The photo's focus point (U46d), in percent: kept in view however the
     * block crops it. Absent, nothing is added and the photo stays centred.
     */
    focus?: { x: number; y: number } | null;
    /** Its ThumbHash, made at upload (DEC-246); the blur while it loads. */
    placeholder?: string | null;
    /** The widths of its smaller copies stored beside it (DEC-246). */
    widths?: readonly number[] | null;
}

/**
 * The business's public media address, compiled in by the Worker's build.
 * Read as written (`process.env.NEXT_PUBLIC_…`) so Next inlines it into
 * the browser's bundle too, and server and browser draw the same markup.
 */
function siteMediaBase(): { main?: string; global?: string } {
    return {
        main: process.env.NEXT_PUBLIC_SITE_MEDIA_URL,
        // Global businesses' own bucket (owner, 22 Nov 2026).
        global: process.env.NEXT_PUBLIC_SITE_MEDIA_URL_GLOBAL,
    };
}

export function siteImage(
    place: ImagePlace = "below",
    image?: SiteImageSource,
): SiteImageProps {
    const loading: SiteImageProps =
        place === "first-hero"
            ? { loading: "eager", decoding: "async", fetchPriority: "high" }
            : {
                  loading: place === "above" ? "eager" : "lazy",
                  decoding: "async",
              };
    const src = image?.src?.trim();
    if (!image || !src) return loading;
    const position = image.focus
        ? `${image.focus.x}% ${image.focus.y}%`
        : undefined;
    const blur = placeholderDataUrl(image.placeholder);
    const style: SiteImageProps["style"] = {
        ...(position ? { objectPosition: position } : {}),
        ...(blur
            ? {
                  backgroundImage: `url("${blur}")`,
                  backgroundSize: "cover",
                  backgroundPosition: position ?? "50% 50%",
              }
            : {}),
    };
    const focused: SiteImageProps =
        position || blur ? { ...loading, style } : loading;
    const stored = storedSrcSet({
        src,
        width: image.width,
        widths: image.widths,
    });
    const sized = stored
        ? { src, srcSet: stored, sizes: image.sizes ?? "100vw" }
        : resizedSources(
              { src, width: image.width, sizes: image.sizes },
              siteMediaBase(),
          );
    if (place === "first-hero") {
        // Called while rendering, as React means it to be: it lands once in
        // the head, however many times the page renders the hero.
        preload(sized?.src ?? src, {
            as: "image",
            fetchPriority: "high",
            ...(sized
                ? { imageSrcSet: sized.srcSet, imageSizes: sized.sizes }
                : {}),
        });
    }
    return sized ? { ...focused, ...sized } : focused;
}

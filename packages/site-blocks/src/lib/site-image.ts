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
}

/** The photo an `<img>` draws, for sizing it. */
export interface SiteImageSource {
    /** The address the `<img>` was given. */
    src: string | null | undefined;
    /** The file's own width in pixels, when known. */
    width?: number | null;
    /** How wide the block draws it (the `sizes` attribute); `100vw` unsaid. */
    sizes?: string;
}

/**
 * The business's public media address, compiled in by the Worker's build.
 * Read as written (`process.env.NEXT_PUBLIC_…`) so Next inlines it into
 * the browser's bundle too, and server and browser draw the same markup.
 */
function siteMediaBase(): string | undefined {
    return process.env.NEXT_PUBLIC_SITE_MEDIA_URL;
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
    const sized = resizedSources(
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
    return sized ? { ...loading, ...sized } : loading;
}

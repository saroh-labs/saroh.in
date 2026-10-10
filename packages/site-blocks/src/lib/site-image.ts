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
 * NO `srcset`: a merchant's photos are served as they were uploaded. The
 * storage (R2, `packages/object-storage`) keeps one file per photo and
 * nothing in front of it resizes on request, so there are no smaller
 * versions to name. When there are, this is the one place that learns it.
 */
export type ImagePlace = "first-hero" | "above" | "below";

export interface SiteImageProps {
    loading: "eager" | "lazy";
    decoding: "async";
    fetchPriority?: "high";
}

export function siteImage(place: ImagePlace = "below"): SiteImageProps {
    if (place === "first-hero") {
        return { loading: "eager", decoding: "async", fetchPriority: "high" };
    }
    return {
        loading: place === "above" ? "eager" : "lazy",
        decoding: "async",
    };
}

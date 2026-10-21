/**
 * The contract between a merchant's page and the image route on the site's
 * Worker (`apps/saroh.app/lib/images/resize.ts`, issue #1043): which photos
 * may be resized, at which widths, and under which address.
 *
 * Pure, with no React, so the Worker imports it too
 * (`@saroh/site-blocks/image-sizes`) and the two sides can't disagree.
 *
 * - **Which photos.** Only a file in the business's public media
 *   (`NEXT_PUBLIC_SITE_MEDIA_URL`), stored under its organization and one of
 *   the image purposes a site draws (`org/<id>/<purpose>/<file>`), in a
 *   format the resizer reads. Anything else (an outside address, an SVG, a
 *   GIF, a data export) keeps its plain `src`.
 * - **Which widths.** A fixed ladder. Any other width is snapped up to the
 *   next step, so the number of versions of a photo is bounded.
 * - **Which address.** `/_img/<width>/<key>` on the site's own host.
 */

/** Every width a photo is served at, smallest first. */
export const IMAGE_WIDTHS = [320, 480, 780, 1200, 1600, 1920] as const;

/** The width `src` names: what a browser without `srcset` gets. */
export const IMAGE_MIDDLE_WIDTH = 780;

/** The route's prefix, answered by the Worker before Next sees it. */
export const IMAGE_ROUTE = "/_img";

/**
 * The upload purposes a merchant's site draws. A data export, a video, a
 * book's file or anything new stays out until it is named here.
 */
export const IMAGE_PURPOSES = [
    "site-image",
    "product-image",
    "business-logo",
] as const;

export type ImagePurpose = (typeof IMAGE_PURPOSES)[number];

/** A media key the route may serve. */
export interface MediaKey {
    key: string;
    organizationId: string;
    purpose: ImagePurpose;
}

// `org/<organization>/<purpose>/<file>`, exactly as storage builds it
// (`packages/object-storage/src/keys.ts`): every segment is already reduced
// to `[a-z0-9-]` (the file to `[a-z0-9._-]`, never starting with a dot).
const KEY_SHAPE =
    /^org\/([a-z0-9][a-z0-9-]*)\/([a-z0-9-]+)\/([a-z0-9][a-z0-9._-]*)$/;

/** Formats the resizer reads and a browser shows without question. */
const RESIZABLE_FILE = /\.(jpe?g|png|webp|avif)$/;

/** The key's parts, or null when it is not a photo a site may resize. */
export function parseMediaKey(key: string): MediaKey | null {
    if (key.length > 512 || key.includes("..")) return null;
    const match = KEY_SHAPE.exec(key);
    if (!match) return null;
    const [, organizationId, purpose, file] = match;
    if (!organizationId || !purpose || !file) return null;
    if (!(IMAGE_PURPOSES as readonly string[]).includes(purpose)) return null;
    if (!RESIZABLE_FILE.test(file)) return null;
    return { key, organizationId, purpose: purpose as ImagePurpose };
}

/** A base URL with no trailing slash, or null when it isn't an https one. */
export function mediaBaseOf(value: string | null | undefined): string | null {
    const raw = value?.trim();
    if (!raw) return null;
    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        return null;
    }
    if (url.protocol !== "https:" || url.search || url.hash) return null;
    let base = `${url.origin}${url.pathname}`;
    while (base.endsWith("/")) base = base.slice(0, -1);
    return base;
}

/**
 * The media key of a photo's address, or null when the address is not one
 * of the business's resizable photos in `mediaBase`.
 */
export function mediaKeyOf(
    src: string | null | undefined,
    mediaBase: string | null | undefined,
): MediaKey | null {
    const base = mediaBaseOf(mediaBase);
    const address = src?.trim();
    if (!base || !address) return null;
    const prefix = `${base}/`;
    if (!address.startsWith(prefix)) return null;
    const key = address.slice(prefix.length);
    // A query or a fragment is not part of a stored key.
    if (/[?#%]/.test(key)) return null;
    return parseMediaKey(key);
}

/** The ladder step a requested width is served at. */
export function snapWidth(width: number): number {
    for (const step of IMAGE_WIDTHS) if (width <= step) return step;
    return IMAGE_WIDTHS[IMAGE_WIDTHS.length - 1];
}

/** The route's address for a key at a width (snapped to the ladder). */
export function resizedPath(key: string, width: number): string {
    return `${IMAGE_ROUTE}/${snapWidth(width)}/${key}`;
}

/** What a request to the route asks for, or null when it asks for nothing. */
export function parseResizedPath(
    pathname: string,
): { width: number; image: MediaKey } | null {
    const prefix = `${IMAGE_ROUTE}/`;
    if (!pathname.startsWith(prefix)) return null;
    const rest = pathname.slice(prefix.length);
    const slash = rest.indexOf("/");
    if (slash <= 0) return null;
    const widthText = rest.slice(0, slash);
    if (!/^[1-9][0-9]{0,4}$/.test(widthText)) return null;
    const image = parseMediaKey(rest.slice(slash + 1));
    if (!image) return null;
    return { width: snapWidth(Number(widthText)), image };
}

/** A photo's sources: `src`, `srcSet` and `sizes` for an `<img>`. */
export interface ResizedSources {
    src: string;
    srcSet: string;
    sizes: string;
}

/**
 * Every ladder step a photo can fill, up to its own width when that is
 * known (a 1000 px photo is offered at 320, 480 and 780, and at its own
 * 1000 px through the 1200 step, which never enlarges it). Null when the
 * photo isn't a resizable one.
 */
export function resizedSources(
    image: { src: string; width?: number | null; sizes?: string },
    mediaBase: string | null | undefined,
): ResizedSources | null {
    const found = mediaKeyOf(image.src, mediaBase);
    if (!found) return null;
    const own =
        typeof image.width === "number" &&
        Number.isFinite(image.width) &&
        image.width > 0
            ? Math.round(image.width)
            : null;
    const candidates: { width: number; path: string }[] = [];
    for (const step of IMAGE_WIDTHS) {
        if (own !== null && step >= own) break;
        candidates.push({ width: step, path: resizedPath(found.key, step) });
    }
    if (own !== null && own <= IMAGE_WIDTHS[IMAGE_WIDTHS.length - 1]) {
        candidates.push({ width: own, path: resizedPath(found.key, own) });
    }
    // Never empty: the ladder, or at least the photo's own width.
    const middle =
        [...candidates].reverse().find((c) => c.width <= IMAGE_MIDDLE_WIDTH) ??
        candidates[0];
    return {
        src: middle.path,
        srcSet: candidates.map((c) => `${c.path} ${c.width}w`).join(", "),
        sizes: image.sizes ?? "100vw",
    };
}

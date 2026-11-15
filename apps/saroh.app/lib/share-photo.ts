// Parked: the API draws share pictures now (Takumi, apps/api.saroh.in/src/modules/share-posts/cards); next/og can't shape Indic scripts.
import { getCloudflareContext } from "@opennextjs/cloudflare";

import { mediaKeyOf, resizedPath } from "@saroh/site-blocks/image-sizes";

import { env } from "@/env";

/**
 * A share picture's photos (#1375 U5): the cover, the circle and the logo,
 * each as a `data:` address next/og can draw, or null for the letter tile.
 *
 * next/og draws only PNG and JPEG, and most uploads are WebP. So a photo of
 * the business's own (a key in its public media) is asked of the site's own
 * image route (`/_img`, `lib/images/resize.ts`) on its live host, through
 * the Worker's binding to itself, as a client that takes neither AVIF nor
 * WebP: it answers a JPEG (or the PNG or JPEG it was). The route keeps its
 * own rules: only that business's photos, resized to the ladder, cached.
 * Anything else, or off Cloudflare (next dev, tests), is fetched as it is.
 */

/** Wide enough for the widest photo box on a card (1080). */
const PHOTO_WIDTH = 1200;

/** What next/og can draw, said as a browser would. */
const DRAWABLE_ACCEPT = "image/jpeg,image/png";

type SelfFetch = (request: Request) => Promise<Response>;

/** The Worker's binding to itself; null off Cloudflare. Never throws. */
function selfFetch(): SelfFetch | null {
    try {
        // Typed here: the Workers globals aren't in this app's types.
        const { env: bindings } = getCloudflareContext() as {
            env: { WORKER_SELF_REFERENCE?: { fetch: SelfFetch } };
        };
        const self = bindings.WORKER_SELF_REFERENCE;
        return self ? (request) => self.fetch(request) : null;
    } catch {
        return null;
    }
}

/** The photo at `url` for a card on `host`, or null. Never throws. */
export async function sharePhoto(
    url: string | null | undefined,
    host: string,
    self: SelfFetch | null = selfFetch(),
): Promise<string | null> {
    const key = mediaKeyOf(url, env.NEXT_PUBLIC_SITE_MEDIA_URL);
    if (key && self) {
        const drawn = await photoData(
            `https://${host}${resizedPath(key.key, PHOTO_WIDTH)}`,
            (address) =>
                self(
                    new Request(address, {
                        headers: { accept: DRAWABLE_ACCEPT },
                    }),
                ),
        );
        if (drawn) return drawn;
    }
    return photoData(url);
}

/** Formats next/og draws; WebP and the rest are left out. */
const DRAWABLE = new Set(["image/png", "image/jpeg"]);
/** The most a photo may weigh before the card goes without it. */
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

/**
 * A photo as a `data:` address next/og can draw, or null when it can't be
 * fetched, is too heavy or is in a format it can't read (the card then
 * draws a tile). Never throws. A WebP or AVIF photo of the business's own
 * is asked for as a JPEG first ({@link sharePhoto}).
 */
export async function photoData(
    url: string | null | undefined,
    fetcher: (url: string) => Promise<Response> = fetch,
): Promise<string | null> {
    if (!url) return null;
    try {
        const res = await fetcher(url);
        if (!res.ok) return null;
        const type = (res.headers.get("content-type") ?? "")
            .split(";")[0]
            ?.trim()
            .toLowerCase();
        if (!type || !DRAWABLE.has(type)) return null;
        const bytes = new Uint8Array(await res.arrayBuffer());
        if (bytes.byteLength > MAX_PHOTO_BYTES) return null;
        let binary = "";
        for (let i = 0; i < bytes.length; i += 0x8000) {
            binary += String.fromCharCode(
                ...Array.from(bytes.subarray(i, i + 0x8000)),
            );
        }
        return `data:${type};base64,${btoa(binary)}`;
    } catch {
        return null;
    }
}

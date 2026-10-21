import type { MediaKey } from "@saroh/site-blocks/image-sizes";
import {
    IMAGE_ROUTE,
    mediaBaseOf,
    parseResizedPath,
} from "@saroh/site-blocks/image-sizes";

import { classifySiteHost } from "../site-host-mode";

/**
 * The merchant sites' image route (#1043): `/_img/<width>/<key>` on a
 * site's own host, answered by the Worker (`worker.ts`) before the page
 * cache and Next. It serves a photo from the business's public media,
 * resized through Cloudflare Images (the `IMAGES` binding) to a step of a
 * fixed ladder, as AVIF or WebP when the browser takes them.
 * `siteImage()` (`@saroh/site-blocks`) writes the addresses; the ladder and
 * which keys qualify are `@saroh/site-blocks/image-sizes`.
 *
 * It must never become an open proxy, a leak or a cost sink:
 *
 * - **Only the business's own photos.** The key must be
 *   `org/<organization>/<image purpose>/<file>` in a format the resizer
 *   reads (never a data export, a video or an SVG), and the organization
 *   must be the one whose live site this host is (read from the public site
 *   read, kept a few minutes). A key of another organization's is a 404.
 * - **Only through the public media address** (`NEXT_PUBLIC_SITE_MEDIA_URL`,
 *   https), never a bucket binding or a signed read: what this route can
 *   fetch is what anyone could fetch already.
 * - **Bounded work.** Widths snap to the ladder, and each result is kept in
 *   the Cache API by host, key, width and format, for a year: a stored key
 *   never changes (a new upload is a new key).
 * - **A photo is never lost.** If the resize fails, the original is served
 *   with a short cache, and only when the source says it is an image.
 * - **Where the host isn't a live site** (the renderer's own apex, which
 *   serves the owner's preview, and a test release's host) the organization
 *   can't be read from the host, so the route only sends the browser to the
 *   original public address: no bytes pass through and nothing is resized.
 *   The same when the binding is missing or the site read fails.
 */

/** The slice of the `IMAGES` binding used here. */
export interface ImagesBindingLike {
    input(stream: ReadableStream<Uint8Array>): {
        transform(options: { width: number; fit: "scale-down" }): {
            output(options: { format: string; quality?: number }): Promise<{
                image(): ReadableStream<Uint8Array>;
                contentType(): string;
            }>;
        };
    };
}

export interface SiteImagesEnv {
    IMAGES?: ImagesBindingLike;
    NEXT_PUBLIC_SITE_MEDIA_URL?: string;
    NEXT_PUBLIC_ROOT_DOMAIN?: string;
    API_URL?: string;
    NEXT_PUBLIC_API_URL?: string;
}

/** The slice of the Cache API used here. */
export interface ImageCacheStore {
    match(key: string): Promise<Response | undefined>;
    put(key: string, response: Response): Promise<void>;
}

export interface SiteImagesDeps {
    openCache: () => Promise<ImageCacheStore>;
    fetch: (input: string, init?: RequestInit) => Promise<Response>;
    log: (event: string, detail?: Record<string, unknown>) => void;
}

export interface WaitUntilLike {
    waitUntil(promise: Promise<unknown>): void;
}

/** Says what the route did, on every response. */
export const IMAGE_STATUS_HEADER = "x-saroh-image";

/** A resized photo: its key never changes, so neither does it. */
const IMMUTABLE = "public, max-age=31536000, immutable";
/** An original served because the resize failed: tried again soon. */
const SHORT = "public, max-age=300";
/** How long the host's owner is believed. */
const OWNER_SECONDS = 300;
/** A source larger than this is never read into memory to be resized. */
const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
const QUALITY = 80;

const RESIZABLE_TYPES = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/avif",
]);

/** Headers every image answer carries: nothing in it can run. */
function imageHeaders(
    contentType: string,
    cacheControl: string,
    status: string,
): Headers {
    return new Headers({
        "content-type": contentType,
        "cache-control": cacheControl,
        vary: "Accept",
        "x-content-type-options": "nosniff",
        "content-security-policy": "default-src 'none'; sandbox",
        [IMAGE_STATUS_HEADER]: status,
    });
}

function notFound(): Response {
    return new Response("Not found", {
        status: 404,
        headers: {
            "cache-control": "public, max-age=60",
            "content-type": "text/plain; charset=utf-8",
            [IMAGE_STATUS_HEADER]: "refused",
        },
    });
}

/** Send the browser to the original, when nothing here may be done. */
function toOriginal(source: string, why: string): Response {
    return new Response(null, {
        status: 302,
        headers: {
            location: source,
            "cache-control": "no-store",
            [IMAGE_STATUS_HEADER]: why,
        },
    });
}

export type OutputFormat = "image/avif" | "image/webp" | null;

/** AVIF, then WebP, by what the browser says it takes; else its own type. */
export function formatFor(accept: string | null): OutputFormat {
    const types = (accept ?? "").toLowerCase();
    if (types.includes("image/avif")) return "image/avif";
    if (types.includes("image/webp")) return "image/webp";
    return null;
}

/** Whose live site a host is. */
export type HostOwner =
    | { kind: "site"; organizationId: string }
    /** Not a live site: the apex, a preview, a test release, nothing. */
    | { kind: "none" }
    /** Couldn't tell: the read failed. */
    | { kind: "unknown" };

/** Asks the public site read whose site `host` is. Never throws. */
export async function readHostOwner(
    host: string,
    env: SiteImagesEnv,
    deps: Pick<SiteImagesDeps, "fetch">,
): Promise<HostOwner> {
    const found = classifySiteHost(
        host,
        env.NEXT_PUBLIC_ROOT_DOMAIN ?? "saroh.app",
    );
    if (found.mode === "test" || !found.lookup) return { kind: "none" };
    const api =
        env.API_URL ?? env.NEXT_PUBLIC_API_URL ?? "https://api.saroh.in";
    const suffix =
        found.lookup.by === "subdomain"
            ? `by-subdomain/${encodeURIComponent(found.lookup.subdomain)}`
            : `by-hostname/${encodeURIComponent(found.lookup.hostname)}`;
    try {
        const res = await deps.fetch(`${api}/public/sites/${suffix}`, {
            headers: { accept: "application/json" },
        });
        if (res.status === 404) return { kind: "none" };
        if (!res.ok) return { kind: "unknown" };
        const body = (await res.json().catch(() => null)) as {
            organizationId?: unknown;
        } | null;
        const id = body?.organizationId;
        return typeof id === "string" && id
            ? { kind: "site", organizationId: id.toLowerCase() }
            : { kind: "unknown" };
    } catch {
        return { kind: "unknown" };
    }
}

/** The host's owner, kept in the cache for a few minutes. */
async function hostOwner(
    host: string,
    env: SiteImagesEnv,
    cache: ImageCacheStore,
    deps: SiteImagesDeps,
    ctx: WaitUntilLike,
): Promise<HostOwner> {
    const key = `https://${host}${IMAGE_ROUTE}/__owner`;
    const kept = await cache.match(key);
    if (kept) {
        const owner = (await kept.json().catch(() => null)) as HostOwner | null;
        if (owner && (owner.kind === "site" || owner.kind === "none")) {
            return owner;
        }
    }
    const owner = await readHostOwner(host, env, deps);
    if (owner.kind !== "unknown") {
        ctx.waitUntil(
            cache
                .put(
                    key,
                    new Response(JSON.stringify(owner), {
                        headers: {
                            "content-type": "application/json",
                            "cache-control": `public, max-age=${OWNER_SECONDS}`,
                        },
                    }),
                )
                .catch(() => undefined),
        );
    }
    return owner;
}

async function readCapped(
    stream: ReadableStream<Uint8Array>,
): Promise<Uint8Array<ArrayBuffer> | null> {
    const reader = stream.getReader();
    const parts: Uint8Array[] = [];
    let size = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_SOURCE_BYTES) {
            await reader.cancel();
            return null;
        }
        parts.push(value);
    }
    const out = new Uint8Array(new ArrayBuffer(size));
    let at = 0;
    for (const part of parts) {
        out.set(part, at);
        at += part.byteLength;
    }
    return out;
}

function streamOf(bytes: Uint8Array): ReadableStream<Uint8Array> {
    return new ReadableStream({
        start(controller) {
            controller.enqueue(bytes);
            controller.close();
        },
    });
}

/** Answers one request to the route. Never throws. */
export async function handleSiteImage(
    request: Request,
    env: SiteImagesEnv,
    ctx: WaitUntilLike,
    deps: SiteImagesDeps,
): Promise<Response> {
    if (request.method !== "GET" && request.method !== "HEAD") {
        return new Response("Method not allowed", {
            status: 405,
            headers: { allow: "GET, HEAD" },
        });
    }
    const url = new URL(request.url);
    const asked = parseResizedPath(url.pathname);
    // A search is never part of a photo's address: one URL per version.
    if (!asked || url.search) return notFound();
    const base = mediaBaseOf(env.NEXT_PUBLIC_SITE_MEDIA_URL);
    if (!base) return notFound();
    const source = `${base}/${asked.image.key}`;

    try {
        return await resize(
            request,
            url.hostname,
            asked,
            source,
            env,
            ctx,
            deps,
        );
    } catch (error) {
        deps.log("site_image_failed", {
            error: error instanceof Error ? error.name : "unknown",
        });
        return toOriginal(source, "fallback");
    }
}

async function resize(
    request: Request,
    host: string,
    asked: { width: number; image: MediaKey },
    source: string,
    env: SiteImagesEnv,
    ctx: WaitUntilLike,
    deps: SiteImagesDeps,
): Promise<Response> {
    const cache = await deps.openCache();
    const owner = await hostOwner(host, env, cache, deps, ctx);
    if (owner.kind === "site") {
        if (owner.organizationId !== asked.image.organizationId) {
            return notFound();
        }
    } else {
        return toOriginal(
            source,
            owner.kind === "none" ? "elsewhere" : "fallback",
        );
    }
    if (!env.IMAGES) return toOriginal(source, "unbound");

    const format = formatFor(request.headers.get("accept"));
    const cacheKey = `https://${host}${IMAGE_ROUTE}/${asked.width}/${asked.image.key}?f=${format ?? "own"}`;
    const kept = await cache.match(cacheKey);
    if (kept) {
        const out = new Response(kept.body, kept);
        out.headers.set(IMAGE_STATUS_HEADER, "hit");
        out.headers.set("vary", "Accept");
        return out;
    }

    const res = await deps.fetch(source, { redirect: "manual" });
    if (!res.ok || !res.body) return notFound();
    const type = (res.headers.get("content-type") ?? "")
        .split(";")[0]
        .trim()
        .toLowerCase();
    // Never an SVG (it can carry script) and never anything not an image.
    if (!type.startsWith("image/") || type === "image/svg+xml") {
        await res.body.cancel();
        return notFound();
    }
    const length = Number(res.headers.get("content-length") ?? 0);
    if (!RESIZABLE_TYPES.has(type) || length > MAX_SOURCE_BYTES) {
        // An image, but not one to resize here: as it is, briefly kept.
        return new Response(res.body, {
            headers: imageHeaders(type, SHORT, "original"),
        });
    }
    const bytes = await readCapped(res.body);
    if (!bytes) return toOriginal(source, "large");

    // AVIF can refuse a large photo; a browser that takes AVIF takes WebP.
    const tries =
        format === "image/avif" ? [format, "image/webp"] : [format ?? type];
    for (const outputType of tries) {
        const resized = await transformed(
            env.IMAGES,
            bytes,
            asked.width,
            outputType,
        ).catch((error: unknown) => {
            deps.log("site_image_resize_failed", {
                width: asked.width,
                format: outputType,
                error: error instanceof Error ? error.name : "unknown",
            });
            return null;
        });
        if (!resized) continue;
        const headers = imageHeaders(outputType, IMMUTABLE, "miss");
        ctx.waitUntil(
            cache
                .put(cacheKey, new Response(resized.slice(), { headers }))
                .catch(() => undefined),
        );
        return new Response(resized, { headers });
    }
    // Nothing resized: the photo as it is, tried again soon. Never kept as
    // a resized version.
    return new Response(bytes, {
        headers: imageHeaders(type, SHORT, "original"),
    });
}

async function transformed(
    images: ImagesBindingLike,
    bytes: Uint8Array<ArrayBuffer>,
    width: number,
    format: string,
): Promise<Uint8Array<ArrayBuffer>> {
    const result = await images
        .input(streamOf(bytes))
        .transform({ width, fit: "scale-down" })
        .output({ format, quality: QUALITY });
    const out = await readCapped(result.image());
    if (!out || out.byteLength === 0) throw new Error("empty");
    return out;
}

/** Wraps the Worker's handler: the image route first, everything else on. */
export function withSiteImages<
    E extends SiteImagesEnv,
    C extends WaitUntilLike,
>(
    next: (request: Request, env: E, ctx: C) => Promise<Response>,
    deps: SiteImagesDeps,
): (request: Request, env: E, ctx: C) => Promise<Response> {
    return (request, env, ctx) => {
        const { pathname } = new URL(request.url);
        if (pathname.startsWith(`${IMAGE_ROUTE}/`)) {
            return handleSiteImage(request, env, ctx, deps);
        }
        return next(request, env, ctx);
    };
}

import { AsyncLocalStorage } from "node:async_hooks";

import type { PageCacheRecord } from "./record";
import { newRecord, RECORD_STORE_KEY } from "./record";
import { decideRequest, pageCacheKey } from "./request-rules";
import {
    REVALIDATE_SIGNATURE_HEADER,
    verifyPageRevalidation,
} from "./signature";
import type { TagNamespace } from "./tag-store";
import { askNewest, tellRevalidated } from "./tag-store";
import { siteOfTag, tagsBySite } from "./tags";

/**
 * The merchant sites' page cache (#863), in front of the OpenNext handler.
 *
 * Every merchant page renders per request (the layout reads the request's
 * host), and a render costs 30–850 ms of CPU. This keeps a rendered page in
 * the Worker's cache (the Cache API, in the data centre the Worker is placed
 * in) and answers the next visitor with it, until the page's time is up or
 * the API says something it was drawn from changed.
 *
 * - **What is kept.** A 200 HTML page or RSC answer, for a visitor who is
 *   nobody in particular (`request-rules.ts`), that the render tagged with
 *   its site and didn't refuse (`record.ts`). Never a response that sets a
 *   cookie.
 * - **How long.** `SITE_PAGE_CACHE_TTL` seconds (default 300), less when
 *   the page asks: a page carrying the merchant's trackers or verification
 *   codes is kept 60 seconds at most, because those are read live outside
 *   the publication (DEC-108) and Saroh's switch must take effect quickly.
 * - **Until what changes.** Each kept page carries its tags; a hit is
 *   served only when no tag was revalidated since the page's render
 *   started (`tag-store.ts`). The API revalidates on publish, a web-address
 *   or tracker change, and stock and price writes (`POST
 *   /__saroh/page-cache/revalidate`, signed with `SITE_RELAY_SECRET`).
 * - **Off.** `SITE_PAGE_CACHE` is not `on`, or a binding is missing:
 *   every request renders as before. Anything failing on the way (the
 *   cache, the tag store) also renders as before, and never keeps the page.
 */

/** What the Worker gives the entry, as far as the cache needs it. */
export interface PageCacheEnv {
    SITE_PAGE_CACHE?: string;
    SITE_PAGE_CACHE_TTL?: string;
    SITE_PAGE_TAGS?: TagNamespace;
    SITE_RELAY_SECRET?: string;
    NEXT_PUBLIC_ROOT_DOMAIN?: string;
    CF_VERSION_METADATA?: { id?: string };
}

export interface WaitUntil {
    waitUntil(promise: Promise<unknown>): void;
}

export type FetchHandler<E, C> = (
    request: Request,
    env: E,
    ctx: C,
) => Promise<Response>;

/** The slice of the Cache API used here. */
export interface PageCacheStore {
    match(key: string): Promise<Response | undefined>;
    put(key: string, response: Response): Promise<void>;
    delete(key: string): Promise<boolean>;
}

export interface PageCacheDeps {
    openCache: () => Promise<PageCacheStore>;
    now: () => number;
    log: (event: string, detail?: Record<string, unknown>) => void;
}

/** Where the API sends revalidations. Never reaches Next. */
export const REVALIDATE_PATH = "/__saroh/page-cache/revalidate";
/** Says what the cache did, on every response it looked at. */
export const CACHE_STATUS_HEADER = "x-saroh-page-cache";

export const DEFAULT_TTL_SECONDS = 300;
const MAX_TTL_SECONDS = 3600;
/** Kept pages larger than this are not kept. */
const MAX_BODY_BYTES = 4 * 1024 * 1024;
/**
 * Clocks on two machines (the render's, the tag store's) may disagree a
 * little: a revalidation this close before a render still counts against it.
 */
const CLOCK_MARGIN_MS = 2000;

const TAGS_HEADER = "x-saroh-page-tags";
const RENDERED_HEADER = "x-saroh-page-rendered";
const TTL_HEADER = "x-saroh-page-ttl";
const ORIGINAL_CC_HEADER = "x-saroh-page-cache-control";
const INTERNAL_HEADERS = [
    TAGS_HEADER,
    RENDERED_HEADER,
    TTL_HEADER,
    ORIGINAL_CC_HEADER,
];

export interface PageCacheConfig {
    tags: TagNamespace;
    ttlSeconds: number;
    version: string;
    rootDomain: string;
}

/** The cache's settings, or null when it is off or can't run. */
export function pageCacheConfig(env: PageCacheEnv): PageCacheConfig | null {
    if (env.SITE_PAGE_CACHE !== "on") return null;
    const tags = env.SITE_PAGE_TAGS;
    const version = env.CF_VERSION_METADATA?.id;
    // Without the secret no revalidation can be believed, so a kept page
    // could outlive a publish by its whole time: don't keep any.
    if (!tags || !version || !env.SITE_RELAY_SECRET) return null;
    const ttl = Number(env.SITE_PAGE_CACHE_TTL ?? DEFAULT_TTL_SECONDS);
    const ttlSeconds =
        Number.isFinite(ttl) && ttl > 0
            ? Math.min(Math.floor(ttl), MAX_TTL_SECONDS)
            : DEFAULT_TTL_SECONDS;
    return {
        tags,
        ttlSeconds,
        version,
        rootDomain: env.NEXT_PUBLIC_ROOT_DOMAIN ?? "saroh.app",
    };
}

/** The store the render's `record.ts` reads, parked once per isolate. */
function recordStore(): AsyncLocalStorage<PageCacheRecord> {
    const g = globalThis as Record<symbol, unknown>;
    const existing = g[RECORD_STORE_KEY];
    if (existing instanceof AsyncLocalStorage) {
        return existing as AsyncLocalStorage<PageCacheRecord>;
    }
    const store = new AsyncLocalStorage<PageCacheRecord>();
    g[RECORD_STORE_KEY] = store;
    return store;
}

function withStatus(response: Response, status: string): Response {
    const out = new Response(response.body, response);
    out.headers.set(CACHE_STATUS_HEADER, status);
    return out;
}

/** `POST /__saroh/page-cache/revalidate`: the API's "these changed". */
export async function handleRevalidate(
    request: Request,
    env: PageCacheEnv,
    deps: Pick<PageCacheDeps, "now" | "log">,
): Promise<Response> {
    if (request.method !== "POST") {
        return new Response("Method not allowed", { status: 405 });
    }
    const secret = env.SITE_RELAY_SECRET;
    const body = await request.text();
    if (
        !secret ||
        body.length > 100_000 ||
        !(await verifyPageRevalidation(
            request.headers.get(REVALIDATE_SIGNATURE_HEADER),
            body,
            secret,
            deps.now(),
        ))
    ) {
        deps.log("page_cache_revalidate_refused");
        return new Response("Unauthorized", { status: 401 });
    }
    let tags: unknown;
    try {
        tags = (JSON.parse(body) as { tags?: unknown }).tags;
    } catch {
        tags = null;
    }
    if (
        !Array.isArray(tags) ||
        !tags.every((t) => typeof t === "string" && siteOfTag(t) !== null)
    ) {
        return new Response("Bad tags", { status: 400 });
    }
    const namespace = env.SITE_PAGE_TAGS;
    if (!namespace) {
        // Nothing can have been kept without the store: nothing to undo.
        return new Response(null, {
            status: 204,
            headers: { [CACHE_STATUS_HEADER]: "off" },
        });
    }
    // Recorded whether the cache is on or not, so a page kept before it was
    // switched off isn't served after it is switched back on.
    const bySite = tagsBySite(tags as string[]);
    await Promise.all(
        Array.from(bySite, ([site, list]) =>
            tellRevalidated(namespace, site, list),
        ),
    );
    deps.log("page_cache_revalidated", {
        sites: bySite.size,
        tags: (tags as string[]).length,
    });
    return new Response(null, { status: 204 });
}

/** A kept page that may still be served, as the visitor gets it; else null. */
async function servable(
    kept: Response,
    config: PageCacheConfig,
    now: number,
): Promise<Response | null> {
    const rendered = Number(kept.headers.get(RENDERED_HEADER));
    const ttl = Number(kept.headers.get(TTL_HEADER));
    const tags = (kept.headers.get(TAGS_HEADER) ?? "")
        .split(" ")
        .filter(Boolean);
    if (!Number.isFinite(rendered) || !Number.isFinite(ttl)) return null;
    if (now - rendered >= ttl * 1000) return null;
    const bySite = tagsBySite(tags);
    // Kept only with its site's tag; anything else is not ours.
    if (bySite.size === 0) return null;
    const newest = await Promise.all(
        Array.from(bySite, ([site, list]) =>
            askNewest(config.tags, site, list),
        ),
    );
    if (newest.some((at) => at >= rendered - CLOCK_MARGIN_MS)) return null;

    const out = new Response(kept.body, kept);
    const original = kept.headers.get(ORIGINAL_CC_HEADER);
    if (original) out.headers.set("cache-control", original);
    else out.headers.delete("cache-control");
    for (const name of INTERNAL_HEADERS) out.headers.delete(name);
    out.headers.set(CACHE_STATUS_HEADER, "hit");
    return out;
}

/** Whether a response may be kept at all, before its body is read. */
function keepableResponse(response: Response): boolean {
    if (response.status !== 200 || !response.body) return false;
    if (response.headers.has("set-cookie")) return false;
    const type = response.headers.get("content-type") ?? "";
    if (!type.startsWith("text/html") && !type.startsWith("text/x-component")) {
        return false;
    }
    const length = Number(response.headers.get("content-length") ?? 0);
    return !(length > MAX_BODY_BYTES);
}

/** Why the render said not to keep it, or null when it may be kept. */
export function refusalOf(record: PageCacheRecord): string | null {
    if (record.refused) return record.refused;
    const sites = tagsBySite(record.tags);
    if (sites.size === 0) return "untagged";
    // A page drawn from two sites is something we don't understand.
    if (sites.size > 1) return "several sites";
    return null;
}

async function readAll(
    stream: ReadableStream<Uint8Array>,
): Promise<ArrayBuffer | null> {
    const reader = stream.getReader();
    const parts: Uint8Array[] = [];
    let size = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BODY_BYTES) {
            await reader.cancel();
            return null;
        }
        parts.push(value);
    }
    const out = new Uint8Array(new ArrayBuffer(size));
    let at = 0;
    parts.forEach((p) => {
        out.set(p, at);
        at += p.byteLength;
    });
    return out.buffer;
}

async function keep(
    stream: ReadableStream<Uint8Array>,
    response: Response,
    record: PageCacheRecord,
    key: string,
    config: PageCacheConfig,
    deps: PageCacheDeps,
): Promise<void> {
    const body = await readAll(stream);
    // Decided once the page has finished rendering: a streamed part can
    // still refuse it.
    const refused = refusalOf(record);
    if (!body || refused) return;
    const ttl = Math.min(
        config.ttlSeconds,
        record.maxAgeSeconds ?? config.ttlSeconds,
    );
    if (ttl <= 0) return;
    const headers = new Headers(response.headers);
    const original = headers.get("cache-control");
    if (original) headers.set(ORIGINAL_CC_HEADER, original);
    headers.set("cache-control", `public, max-age=${ttl}`);
    headers.set(TAGS_HEADER, Array.from(record.tags).join(" "));
    headers.set(RENDERED_HEADER, String(record.startedAt));
    headers.set(TTL_HEADER, String(ttl));
    headers.delete(CACHE_STATUS_HEADER);
    const cache = await deps.openCache();
    await cache.put(key, new Response(body, { status: 200, headers }));
}

/**
 * Wrap the OpenNext handler. `deps` are the Worker's own in production;
 * tests pass fakes.
 */
export function withPageCache<E extends PageCacheEnv, C extends WaitUntil>(
    inner: FetchHandler<E, C>,
    deps: PageCacheDeps,
): FetchHandler<E, C> {
    return async (request, env, ctx) => {
        if (new URL(request.url).pathname === REVALIDATE_PATH) {
            try {
                return await handleRevalidate(request, env, deps);
            } catch (error) {
                deps.log("page_cache_revalidate_failed", {
                    error: error instanceof Error ? error.name : "unknown",
                });
                return new Response("Revalidation failed", { status: 503 });
            }
        }

        const config = pageCacheConfig(env);
        if (!config) return inner(request, env, ctx);
        const decision = decideRequest(request, config.rootDomain);
        if (!decision.cacheable) return inner(request, env, ctx);

        let key: string;
        try {
            key = await pageCacheKey(request, decision.host, config.version);
            const cache = await deps.openCache();
            const kept = await cache.match(key);
            if (kept) {
                const hit = await servable(kept, config, deps.now());
                if (hit) return hit;
                ctx.waitUntil(cache.delete(key).catch(() => false));
            }
        } catch (error) {
            // The cache or the tag store failed: render, and keep nothing,
            // since a page kept now can't be checked later either.
            deps.log("page_cache_unavailable", {
                error: error instanceof Error ? error.name : "unknown",
            });
            return inner(request, env, ctx);
        }

        const record = newRecord(deps.now());
        const response = await recordStore().run(record, () =>
            inner(request, env, ctx),
        );
        if (!keepableResponse(response) || !response.body) {
            return withStatus(response, "bypass");
        }
        const [toVisitor, toCache] = response.body.tee();
        ctx.waitUntil(
            keep(toCache, response, record, key, config, deps).catch(
                (error: unknown) => {
                    deps.log("page_cache_keep_failed", {
                        error: error instanceof Error ? error.name : "unknown",
                    });
                },
            ),
        );
        const out = new Response(toVisitor, response);
        out.headers.set(CACHE_STATUS_HEADER, "miss");
        return out;
    };
}

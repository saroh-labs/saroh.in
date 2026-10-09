/**
 * What a page tells the page cache while it renders (#863).
 *
 * The Worker's page cache (`lib/page-cache/worker.ts`) wraps each request it
 * might keep in a record, reachable from the render through an
 * AsyncLocalStorage it parks on `globalThis` (the Worker's entry and the Next
 * server are separate bundles, so a module-level store would be two). A page
 * is kept only when the render has said whose it is — `tagPage(siteTag(…))`,
 * which the site layout does once it has resolved a live site — and nothing
 * said not to.
 *
 * Outside the Worker (`next dev`, a test) there is no record, and
 * every call here does nothing: those render per request, as they always did.
 */

export interface PageCacheRecord {
    /** When the request started (ms): reads after this are in the page. */
    startedAt: number;
    tags: Set<string>;
    /** The most seconds this page may be kept, when something limits it. */
    maxAgeSeconds: number | null;
    /** Why this page must not be kept, when it mustn't. First reason wins. */
    refused: string | null;
}

interface RecordStore {
    getStore(): PageCacheRecord | undefined;
}

/** Where the Worker parks its store. */
export const RECORD_STORE_KEY = Symbol.for("saroh.page-cache.record");

export function newRecord(now: number): PageCacheRecord {
    return {
        startedAt: now,
        tags: new Set(),
        maxAgeSeconds: null,
        refused: null,
    };
}

function current(): PageCacheRecord | undefined {
    const store = (globalThis as Record<symbol, RecordStore | undefined>)[
        RECORD_STORE_KEY
    ];
    try {
        return store?.getStore();
    } catch {
        return undefined;
    }
}

/** Say what this page was drawn from (`lib/page-cache/tags.ts`). */
export function tagPage(...tags: string[]): void {
    const record = current();
    if (!record) return;
    for (const tag of tags) record.tags.add(tag);
}

/**
 * Keep this page at most `seconds`: for what changes outside the API's
 * revalidations, such as the merchant's trackers (DEC-108).
 */
export function keepPageAtMost(seconds: number): void {
    const record = current();
    if (!record) return;
    record.maxAgeSeconds =
        record.maxAgeSeconds === null
            ? seconds
            : Math.min(record.maxAgeSeconds, seconds);
}

/**
 * Never keep this page: it is about one visitor, a test release, or it was
 * drawn from a read that failed (a page that says "unavailable" must not be
 * what everyone sees for the next few minutes).
 */
export function dontCachePage(reason: string): void {
    const record = current();
    if (!record || record.refused) return;
    record.refused = reason;
}

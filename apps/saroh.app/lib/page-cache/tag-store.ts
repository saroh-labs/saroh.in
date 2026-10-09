/**
 * When each tag was last revalidated (#863): a Durable Object per site,
 * `SitePageTags`, bound as `SITE_PAGE_TAGS` (wrangler.jsonc).
 *
 * A Durable Object rather than KV or D1 because it is strongly consistent
 * (the next visit after a publish sees it, where KV can lag a minute) and
 * because wrangler creates it on deploy from the class's migration: nobody
 * has to make a database or namespace first. One object per site keeps a
 * busy site's lookups off everyone else's.
 *
 * Talked to over `fetch` with JSON, so this file needs nothing from
 * `cloudflare:workers` and is tested in Node with a fake storage.
 */

/** The slice of `DurableObjectStorage` used here. */
export interface TagStorage {
    get<T>(keys: string[]): Promise<Map<string, T>>;
    put<T>(entries: Record<string, T>): Promise<void>;
}

/** The slice of `DurableObjectState` used here. */
export interface TagObjectState {
    storage: TagStorage;
}

/** The slice of a Durable Object namespace the Worker uses. */
export interface TagNamespace {
    idFromName(name: string): unknown;
    get(id: unknown): { fetch(request: Request): Promise<Response> };
}

/** The storage API takes at most 128 keys a call. */
const CHUNK = 128;

function chunks<T>(list: readonly T[]): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < list.length; i += CHUNK)
        out.push(list.slice(i, i + CHUNK));
    return out;
}

/** The newest revalidation among `tags` (ms), or 0 when none was. */
export async function newestOf(
    storage: TagStorage,
    tags: readonly string[],
): Promise<number> {
    let newest = 0;
    for (const part of chunks(tags)) {
        const found = await storage.get<number>(part);
        found.forEach((at) => {
            if (typeof at === "number" && at > newest) newest = at;
        });
    }
    return newest;
}

/** Stamp `tags` as revalidated at `at` (ms). */
export async function revalidate(
    storage: TagStorage,
    tags: readonly string[],
    at: number,
): Promise<void> {
    for (const part of chunks(tags)) {
        await storage.put<number>(Object.fromEntries(part.map((t) => [t, at])));
    }
}

function tagsOf(body: unknown): string[] | null {
    if (typeof body !== "object" || body === null) return null;
    const tags = (body as { tags?: unknown }).tags;
    if (!Array.isArray(tags) || tags.length > 1000) return null;
    return tags.every((t): t is string => typeof t === "string") ? tags : null;
}

/** The Durable Object. Exported from the Worker's entry (`worker.ts`). */
export class SitePageTags {
    constructor(private readonly state: TagObjectState) {}

    async fetch(request: Request): Promise<Response> {
        const path = new URL(request.url).pathname;
        const tags = tagsOf(await request.json().catch(() => null));
        if (!tags) return new Response("bad tags", { status: 400 });
        if (path === "/newest") {
            return Response.json({
                newest: await newestOf(this.state.storage, tags),
            });
        }
        if (path === "/revalidate") {
            await revalidate(this.state.storage, tags, Date.now());
            return new Response(null, { status: 204 });
        }
        return new Response("not found", { status: 404 });
    }
}

function stubFor(namespace: TagNamespace, siteId: string) {
    return namespace.get(namespace.idFromName(siteId));
}

/** Ask a site's object for the newest revalidation among `tags`. */
export async function askNewest(
    namespace: TagNamespace,
    siteId: string,
    tags: readonly string[],
): Promise<number> {
    const res = await stubFor(namespace, siteId).fetch(
        new Request("https://page-tags/newest", {
            method: "POST",
            body: JSON.stringify({ tags }),
        }),
    );
    if (!res.ok) throw new Error(`page tags answered ${res.status}`);
    const body = (await res.json()) as { newest?: unknown };
    if (typeof body.newest !== "number")
        throw new Error("page tags: no answer");
    return body.newest;
}

/** Tell a site's object that `tags` changed now. */
export async function tellRevalidated(
    namespace: TagNamespace,
    siteId: string,
    tags: readonly string[],
): Promise<void> {
    const res = await stubFor(namespace, siteId).fetch(
        new Request("https://page-tags/revalidate", {
            method: "POST",
            body: JSON.stringify({ tags }),
        }),
    );
    if (!res.ok) throw new Error(`page tags answered ${res.status}`);
}

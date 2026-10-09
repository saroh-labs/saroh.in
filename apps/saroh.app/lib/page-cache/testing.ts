import type { TagNamespace, TagStorage } from "./tag-store";
import { SitePageTags } from "./tag-store";
import type { PageCacheStore } from "./worker";

/**
 * Fakes of the Worker's pieces for the page cache's tests (#863): the
 * Durable Object storage and namespace, and the Cache API. Imported by tests
 * only.
 */

export function fakeStorage(): TagStorage & { data: Map<string, unknown> } {
    const data = new Map<string, unknown>();
    return {
        data,
        get<T>(keys: string[]) {
            if (keys.length > 128) {
                return Promise.reject(new Error("too many keys"));
            }
            const out = new Map<string, T>();
            keys.forEach((k) => {
                if (data.has(k)) out.set(k, data.get(k) as T);
            });
            return Promise.resolve(out);
        },
        put<T>(entries: Record<string, T>) {
            if (Object.keys(entries).length > 128) {
                return Promise.reject(new Error("too many keys"));
            }
            Object.entries(entries).forEach(([k, v]) => data.set(k, v));
            return Promise.resolve();
        },
    };
}

/** One object per site, as the namespace gives them. */
export function fakeNamespace(): TagNamespace & {
    objects: Map<string, SitePageTags>;
} {
    const objects = new Map<string, SitePageTags>();
    return {
        objects,
        idFromName: (name: string) => name,
        get(id: unknown) {
            const name = String(id);
            let object = objects.get(name);
            if (!object) {
                object = new SitePageTags({ storage: fakeStorage() });
                objects.set(name, object);
            }
            const target = object;
            return { fetch: (request: Request) => target.fetch(request) };
        },
    };
}

/** The Cache API, as one named cache, in memory. */
export function fakeCache(): PageCacheStore & {
    entries: Map<string, Response>;
} {
    const entries = new Map<string, Response>();
    return {
        entries,
        match: (key) => Promise.resolve(entries.get(key)?.clone()),
        put: (key, response) => {
            entries.set(key, response);
            return Promise.resolve();
        },
        delete: (key) => Promise.resolve(entries.delete(key)),
    };
}

import { AsyncLocalStorage } from "node:async_hooks";

/**
 * One API answer per URL for a request outside a render (DEC-259). React's
 * `cache()` and Next's fetch memo hold only in a render, so in a read route
 * or a Server Action every service asking for the active business (and so
 * the business list) asks the API again.
 */
interface Scope {
    memo: Map<string, Promise<Response>>;
    /** Which URLs are kept; absent, every GET. */
    only?: (url: string) => boolean;
    /**
     * The business this request works in, when the read route has already
     * settled it (the tab's claim equals the cookie). The API checks
     * membership and paused seats on every call, so the list isn't asked.
     */
    activeOrg?: string;
}
const scope = new AsyncLocalStorage<Scope>();

/**
 * Run `fn` with one answer per URL: a read route's handler (every GET),
 * or a Server Action's write (`only` the business list, which the write
 * doesn't change, so a read after the write is never an old answer).
 */
export function inReadScope<T>(
    fn: () => Promise<T>,
    only?: (url: string) => boolean,
): Promise<T> {
    return scope.run({ memo: new Map(), only }, fn);
}

/** Settle this scope's business (a read route, after its org check). */
export function setScopedOrg(orgId: string): void {
    const store = scope.getStore();
    if (store) store.activeOrg = orgId;
}

/** The business a read route settled, if any. */
export function scopedOrg(): string | undefined {
    return scope.getStore()?.activeOrg;
}

/** The business list's URL, for `inReadScope`'s `only`. */
export const isOrganizationList = (url: string): boolean =>
    new URL(url).pathname === "/organizations";

/** A GET to the API: once per URL inside a scope, else as ever. */
export function readOnce(url: string, init: RequestInit): Promise<Response> {
    const store = scope.getStore();
    if (!store || (store.only && !store.only(url))) return fetch(url, init);
    let answer = store.memo.get(url);
    if (!answer) {
        answer = fetch(url, init);
        store.memo.set(url, answer);
        // A failed fetch isn't kept: the next ask tries again.
        answer.catch(() => store.memo.delete(url));
    }
    // Each caller reads its own copy; the kept one is never read.
    return answer.then((res) => res.clone());
}

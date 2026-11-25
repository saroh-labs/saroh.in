import type { QueryClient } from "@tanstack/react-query";

import type { Read } from "@/lib/query/define-read";

/** Each promise seeds once, however often React runs its effect. */
const seeded = new WeakSet<Promise<unknown>>();

/**
 * Fill a read's key from an answer the server is still streaming (the
 * shell's, `ShellSeed`), instead of asking its route. Readers that mount
 * meanwhile join this read. `null` or a rejection asks the route; fresh
 * held data stays (its tier's `staleTime`). One-shot: any later read of
 * the key (a save, the live refresh) is the route's.
 */
export function seedRead<P, T>(
    client: QueryClient,
    read: Read<P, T>,
    orgId: string,
    params: P,
    promise: Promise<T | null>,
): void {
    if (seeded.has(promise)) return;
    seeded.add(promise);
    const options = read.options(orgId, params);
    const route = options.queryFn;
    if (typeof route !== "function") return;
    let used = false;
    void client.prefetchQuery({
        ...options,
        queryFn: async (ctx) => {
            if (used) return route(ctx);
            used = true;
            // React's streamed promise is a bare thenable: its `then`
            // returns nothing, so no `.catch()` chain on it.
            const data = await new Promise<T | null>((resolve) => {
                promise.then(resolve, () => resolve(null));
            });
            return data ?? route(ctx);
        },
    });
}

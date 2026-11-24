import type { DataTag, UseQueryOptions } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";
import type { z } from "zod";

import { apiRead } from "@/lib/query/api-read";
import type { DomainKey } from "@/lib/query/keys";

/**
 * A read, defined once for both paths (DEC-259). Client-safe: it names the
 * route and the key, not the service, so a component importing it pulls no
 * server code. The server side pairs it with its service once
 * (`ServerRead`, `route.ts`), and the route answers through
 * {@link toWire} (as the contract test's `prefetchRead` does), so the
 * service and the wire can't differ in shape.
 *
 *     export const ordersList = defineRead<Order[]>()({
 *         key: (orgId, p) => domainKey("orders", orgId, "list", p),
 *         route: { path: "/api/orders", params: { q: searchText } },
 *     });
 */
export interface Read<P, T> {
    path: string;
    params: z.ZodRawShape;
    key: (orgId: string, params: P) => DomainKey;
    options: (
        orgId: string,
        params: P,
    ) => UseQueryOptions<T, Error, T, DomainKey> & {
        queryKey: DataTag<DomainKey, T, Error>;
    };
}

/** How long a read just made counts as fresh: a remount reads nothing. */
export const HYDRATED_FRESH_MS = 5_000;

export function defineRead<T>() {
    return <S extends z.ZodRawShape>(def: {
        key: (orgId: string, params: z.output<z.ZodObject<S>>) => DomainKey;
        route: { path: string; params: S };
    }): Read<z.output<z.ZodObject<S>>, T> => ({
        path: def.route.path,
        params: def.route.params,
        key: def.key,
        options: (orgId, params) =>
            queryOptions<T, Error, T, DomainKey>({
                queryKey: def.key(orgId, params),
                queryFn: ({ signal }) =>
                    apiRead<T>(def.route.path, params, { orgId, signal }),
                // A read just made is fresh for a moment, so a second
                // mount (Back, a sheet) reads nothing (KTD-4); an
                // invalidation still reads.
                staleTime: HYDRATED_FRESH_MS,
            }),
    });
}

/**
 * What a read's answer becomes on the wire, on both paths: JSON. A Date
 * arrives as its ISO string either way and an `undefined` field is
 * dropped either way; a Map or Set would arrive empty, so it throws.
 */
export function toWire<T>(value: T): T {
    return JSON.parse(
        JSON.stringify(value, (_key, v: unknown) => {
            if (v instanceof Map || v instanceof Set) {
                throw new TypeError("A read answers JSON: no Map or Set");
            }
            return v;
        }),
    ) as T;
}

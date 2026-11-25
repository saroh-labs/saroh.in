import type { DataTag, UseQueryOptions } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";
import type { z } from "zod";

import { apiRead } from "@/lib/query/api-read";
import type { Tier } from "@/lib/query/freshness";
import { FRESHNESS } from "@/lib/query/freshness";
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
 *         tier: "live",
 *     });
 */
export interface Read<P, T> {
    path: string;
    /** How often its answer changes (`freshness.ts`). */
    tier: Tier;
    params: z.ZodRawShape;
    key: (orgId: string, params: P) => DomainKey;
    options: (
        orgId: string,
        params: P,
    ) => UseQueryOptions<T, Error, T, DomainKey> & {
        queryKey: DataTag<DomainKey, T, Error>;
    };
}

export function defineRead<T>() {
    return <S extends z.ZodRawShape>(def: {
        key: (orgId: string, params: z.output<z.ZodObject<S>>) => DomainKey;
        route: { path: string; params: S };
        tier: Tier;
    }): Read<z.output<z.ZodObject<S>>, T> => ({
        path: def.route.path,
        tier: def.tier,
        params: def.route.params,
        key: def.key,
        options: (orgId, params) =>
            queryOptions<T, Error, T, DomainKey>({
                queryKey: def.key(orgId, params),
                queryFn: ({ signal }) =>
                    apiRead<T>(def.route.path, params, { orgId, signal }),
                // Fresh for as long as its tier says (owner, 25 Nov); an
                // invalidation still reads.
                ...FRESHNESS[def.tier],
                meta: { tier: def.tier },
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

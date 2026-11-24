import type { QueryClient } from "@tanstack/react-query";

import { ReadFailed } from "@/lib/query/client";
import { toWire } from "@/lib/query/define-read";
import type { ServerRead } from "@/lib/query/route";

/**
 * A page's prefetch of a read (DEC-259): the service, asked directly, its
 * answer put on the wire as the route would (`toWire`). Never throws: a
 * failure leaves the query failed, it isn't dehydrated, and the browser
 * asks the route, landing in the section's failed state. Awaited or not,
 * the page then passes `dehydrate(client)` to a `HydrationBoundary`; a
 * pending query crosses too, for the domains `dehydrate-allow.ts` names.
 */
export function prefetchRead<P, T>(
    client: QueryClient,
    { read, service }: ServerRead<P, T>,
    orgId: string,
    params: P,
): Promise<void> {
    return client.prefetchQuery({
        queryKey: read.key(orgId, params),
        queryFn: async () => {
            const data = await service(params);
            if (data === null) throw new ReadFailed(404);
            return toWire(data);
        },
    });
}

import { defineRead } from "@/lib/query/define-read";
import type { DomainKey } from "@/lib/query/keys";
import { domainKey } from "@/lib/query/keys";

import type { CollectionSummary } from "./service";

/**
 * Collections' read (DEC-259): every collection of the business, for the
 * Products list's Collections cards and Filter, and a product's
 * Collections tab. Client-safe: the key and the route; the service is
 * paired in `access.ts`.
 */

/** Every Collections read of a business: what a collection save invalidates. */
export const collectionsKeys = (orgId: string): DomainKey =>
    domainKey("collections", orgId);

export const collectionsRead = defineRead<CollectionSummary[]>()({
    key: (orgId) => domainKey("collections", orgId, "list"),
    route: { path: "/api/collections", params: {} },
    tier: "records",
});

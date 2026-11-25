import "server-only";

import type { ServerRead } from "@/lib/query/route";

import { collectionsRead } from "./queries";
import type { CollectionSummary } from "./service";
import { listCollections } from "./service";

type NoParams = Parameters<typeof collectionsRead.key>[1];

/**
 * Every collection (`/api/collections`), to whoever may open Products
 * while Sell is on (`mayReadProducts`); the API checks `store:read` again.
 * A failed read throws (a 503), never "no collections".
 */
export const collectionsServer: ServerRead<NoParams, CollectionSummary[]> = {
    read: collectionsRead,
    service: () => listCollections(),
};

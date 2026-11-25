import { NOT_ALLOWED, readRoute } from "@/lib/query/route";
import {
    mayReadSubscriptions,
    subscriptionsListServer,
} from "@/lib/subscriptions/access-server";

/** The subscriptions list and its Plans tab (DEC-259); provider fields never leave the server (`wire.ts`). */
export const dynamic = "force-dynamic";
export const GET = readRoute(subscriptionsListServer, mayReadSubscriptions);
export const { POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = NOT_ALLOWED;

import { NOT_ALLOWED, readRoute } from "@/lib/query/route";
import {
    mayReadSubscriptions,
    subscriptionServer,
} from "@/lib/subscriptions/access-server";

/** One subscription's page (DEC-259); another business's is a 404, provider fields stay on the server. */
export const dynamic = "force-dynamic";
export const GET = readRoute(subscriptionServer, mayReadSubscriptions);
export const { POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = NOT_ALLOWED;

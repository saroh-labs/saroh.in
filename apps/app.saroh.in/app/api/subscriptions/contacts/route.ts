import { NOT_ALLOWED, readRoute } from "@/lib/query/route";
import {
    maySubscribe,
    subscriptionContactsServer,
} from "@/lib/subscriptions/access-server";

/** Who Subscribe someone can pick (DEC-259): only for someone who may subscribe them. */
export const dynamic = "force-dynamic";
export const GET = readRoute(subscriptionContactsServer, maySubscribe);
export const { POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = NOT_ALLOWED;

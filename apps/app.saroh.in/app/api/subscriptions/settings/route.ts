import { NOT_ALLOWED, readRoute } from "@/lib/query/route";
import {
    mayReadSubscriptions,
    subscriptionSettingsServer,
} from "@/lib/subscriptions/access-server";

/** Settings for every plan (A8, D13B), a settings-tier read (DEC-259). */
export const dynamic = "force-dynamic";
export const GET = readRoute(subscriptionSettingsServer, mayReadSubscriptions);
export const { POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = NOT_ALLOWED;

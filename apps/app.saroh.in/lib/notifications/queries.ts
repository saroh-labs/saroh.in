import { defineRead } from "@/lib/query/define-read";
import type { DomainKey } from "@/lib/query/keys";
import { domainKey } from "@/lib/query/keys";

import type { Notification } from "./service";

/**
 * Notifications' read (DEC-259): the inbox, newest first, as the API gives
 * this person in this business. Client-safe: the key and the route; the
 * service is paired in `access.ts`. Live: what it shows arrives from
 * outside (orders, enquiries, reviews).
 */

/** Every Notifications read of a business: what a mark-read reads again. */
export const notificationsKeys = (orgId: string): DomainKey =>
    domainKey("notifications", orgId);

export const notificationsRead = defineRead<Notification[]>()({
    key: (orgId) => domainKey("notifications", orgId, "list"),
    route: { path: "/api/notifications", params: {} },
    tier: "live",
});

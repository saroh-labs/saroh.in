import "server-only";

import type { ServerRead } from "@/lib/query/route";

import { notificationsRead } from "./queries";
import type { Notification } from "./service";
import { listNotifications } from "./service";

/**
 * The inbox on the server (DEC-259): what `/api/notifications` answers
 * with. The API decides whose rows each person gets (`notification:read`,
 * `notification:read-own`); a row crosses with only what the inbox draws,
 * not its business, person or payload.
 */
async function readInbox(): Promise<Notification[]> {
    const rows = await listNotifications();
    return rows.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body,
        leadId: n.leadId,
        reviewId: n.reviewId,
        contactId: n.contactId ?? null,
        target: n.target ? { kind: n.target.kind, id: n.target.id } : null,
        readAt: n.readAt,
        createdAt: n.createdAt,
    }));
}

export const notificationsServer: ServerRead<
    Parameters<typeof notificationsRead.options>[1],
    Notification[]
> = { read: notificationsRead, service: readInbox };

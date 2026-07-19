"use server";

import type { NotificationsResult } from "./service";
import {
    markAllNotificationsRead as markAllApi,
    markNotificationRead as markReadApi,
} from "./service";

/**
 * Server Actions for the notification inbox. Thin wrappers that post to
 * api.saroh.in forwarding the session cookie + active-org header; the API
 * resolves the user from the session (never a client id) and enforces
 * membership + `notification:write`. Kept separate from the read service so the
 * UI is decoupled from where the data lives.
 */

export async function markNotificationRead(
    id: string,
): Promise<NotificationsResult<{ id: string }>> {
    return markReadApi(id);
}

export async function markAllNotificationsRead(): Promise<
    NotificationsResult<{ updated: number }>
> {
    return markAllApi();
}

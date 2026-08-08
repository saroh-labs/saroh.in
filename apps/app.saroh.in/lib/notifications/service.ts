import { apiFetch, getActiveOrgId, getList, readError } from "@/lib/api/http";

/**
 * In-app notification data access for app.saroh.in (S3-006). The owner/admin
 * inbox is backed by the notifications API on api.saroh.in: a new enquiry is
 * turned into one durable Notification by the job worker, and this module reads
 * + acknowledges those rows.
 *
 * Every call is org-scoped exactly like `lib/forms/service.ts`: the active
 * organization id (from the `active_org` cookie) is used both in the path
 * (`/organizations/:organizationId/notifications`) and forwarded as the
 * `x-organization-id` header, and the session cookie is forwarded so
 * api.saroh.in derives the user and enforces membership + `notification:read` /
 * `notification:write`. Server-only: imports next/headers (via the shared
 * HTTP plumbing).
 */

/** A notification as returned by the notifications API. */
export interface Notification {
    id: string;
    type: string;
    title: string;
    body: string | null;
    leadId: string | null;
    readAt: string | null;
    createdAt: string;
}

/** Discriminated result so callers can surface a message. */
export type NotificationsResult<T> =
    | { ok: true; data: T }
    | { ok: false; error: string };

/** Base path for the active org's notifications, or null when no org is active. */
async function notificationsBase(): Promise<string | null> {
    const orgId = await getActiveOrgId();
    return orgId ? `/organizations/${orgId}/notifications` : null;
}

/** The active org's notifications, newest-first. Empty with no active org /
 * when none exist, but throws on a real API/network failure (#101). */
export async function listNotifications(
    options: { unreadOnly?: boolean } = {},
): Promise<Notification[]> {
    const base = await notificationsBase();
    if (!base) return [];
    return getList<Notification>(
        options.unreadOnly ? `${base}?unread=true` : base,
    );
}

/**
 * The active org's unread notification count (for the nav badge). 0 on ANY
 * failure — intentionally non-throwing (unlike the #101 reads): it renders in
 * `AppHeader` in the root layout on every page, which must degrade to a hidden
 * badge rather than tripping the global error boundary.
 */
export async function unreadNotificationCount(): Promise<number> {
    const base = await notificationsBase();
    if (!base) return 0;
    const res = await apiFetch(`${base}/unread-count`);
    if (!res.ok) return 0;
    const data = (await res.json().catch(() => null)) as {
        count?: number;
    } | null;
    return data?.count ?? 0;
}

/** Mark one notification read. */
export async function markNotificationRead(
    id: string,
): Promise<NotificationsResult<{ id: string }>> {
    const base = await notificationsBase();
    if (!base) return { ok: false, error: "No active organization." };
    const res = await apiFetch(`${base}/${id}/read`, { method: "POST" });
    const data = (await res.json().catch(() => null)) as {
        message?: string;
        error?: string;
    } | null;
    if (res.ok) return { ok: true, data: { id } };
    return { ok: false, error: readError(data, "Could not mark as read") };
}

/** Mark every notification in the active org read. */
export async function markAllNotificationsRead(): Promise<
    NotificationsResult<{ updated: number }>
> {
    const base = await notificationsBase();
    if (!base) return { ok: false, error: "No active organization." };
    const res = await apiFetch(`${base}/read-all`, { method: "POST" });
    const data = (await res.json().catch(() => null)) as {
        updated?: number;
        message?: string;
        error?: string;
    } | null;
    if (res.ok) return { ok: true, data: { updated: data?.updated ?? 0 } };
    return { ok: false, error: readError(data, "Could not mark all as read") };
}

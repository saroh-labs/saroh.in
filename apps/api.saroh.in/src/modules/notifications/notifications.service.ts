import { Injectable, NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { authorize } from "../organizations/organization-policy";

/** Options for {@link NotificationsService.list}. */
export interface ListNotificationsOptions {
    /** When true, only return unread (`readAt IS NULL`) notifications. */
    unreadOnly?: boolean;
}

/**
 * Read + acknowledge surface for org in-app notifications (S3-006).
 *
 * The write side (creating the durable row for a new enquiry) lives in the
 * `enquiry.notify` job handler, not here — this service only lets an authorized
 * member READ their org's inbox and mark items read. Every operation is
 * tenant-scoped by `ctx.organizationId` (proven by `OrganizationGuard`, never a
 * client value) and gated by the `notification:read` / `notification:write`
 * policy (OWNER/ADMIN-only), so one org can never read or mutate another's
 * notifications, and a cross-tenant id is a 404 (not a 403) so callers can't
 * probe which notifications exist elsewhere.
 */
@Injectable()
export class NotificationsService {
    /** List the org's notifications newest-first; optionally unread-only. */
    async list(
        ctx: OrganizationContext,
        options: ListNotificationsOptions = {},
    ) {
        authorize(ctx, "notification:read");
        return prisma.notification.findMany({
            where: {
                organizationId: ctx.organizationId,
                ...(options.unreadOnly ? { readAt: null } : {}),
            },
            orderBy: { createdAt: "desc" },
        });
    }

    /** Count the org's unread notifications (for a nav badge). */
    async unreadCount(ctx: OrganizationContext): Promise<{ count: number }> {
        authorize(ctx, "notification:read");
        const count = await prisma.notification.count({
            where: { organizationId: ctx.organizationId, readAt: null },
        });
        return { count };
    }

    /**
     * Mark one notification read. Authorizes `notification:write`, loads the
     * org's own row (404 for missing OR cross-tenant), and stamps `readAt`.
     * Idempotent: an already-read row keeps its original `readAt`.
     */
    async markRead(ctx: OrganizationContext, id: string) {
        authorize(ctx, "notification:write");
        const existing = await this.requireOwned(ctx, id);
        if (existing.readAt) return existing;
        return prisma.notification.update({
            where: { id: existing.id },
            data: { readAt: new Date() },
        });
    }

    /**
     * Mark every unread notification in the org read. Authorizes
     * `notification:write`; scoped to the ctx org. Returns how many were flipped.
     */
    async markAllRead(ctx: OrganizationContext): Promise<{ updated: number }> {
        authorize(ctx, "notification:write");
        const res = await prisma.notification.updateMany({
            where: { organizationId: ctx.organizationId, readAt: null },
            data: { readAt: new Date() },
        });
        return { updated: res.count };
    }

    /**
     * Load a notification and assert it belongs to `ctx.organizationId`. Throws
     * `NotFoundException` for a missing OR cross-tenant id — a 404 (not 403) so a
     * caller can't probe which notifications exist in another org.
     */
    private async requireOwned(ctx: OrganizationContext, id: string) {
        const notification = await prisma.notification.findUnique({
            where: { id },
        });
        if (notification?.organizationId !== ctx.organizationId) {
            throw new NotFoundException("Notification not found");
        }
        return notification;
    }
}

import { Injectable, NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { clearStaleLimitNotices } from "../billing/limit-notice-clear";
import { allows, authorize } from "../organizations/organization-policy";
import { hiddenNotificationTypes } from "./alert-preferences";
import { noticeTargetOf } from "./notice-target";

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
 *
 * The inbox is the business's, but what each person sees of it is theirs
 * (round-2 F14): a notice for an alert they turned the bell off for, or
 * that their role can't read, is left out of their list and their count,
 * and "Mark all read" leaves it alone.
 *
 * A plan limit notice that no longer stands (the team back under its cap,
 * a new month, a plan move) is cleared before the inbox is read (UX-041,
 * `billing/limit-notice-clear.ts`).
 *
 * Every row is read with its `target` (10 Oct 2026): the kind of thing it
 * opens and that thing's id (`notice-target.ts`), so the inbox draws each
 * row as a link and never has to guess from the type.
 */
@Injectable()
export class NotificationsService {
    /** List the org's notifications newest-first; optionally unread-only. */
    async list(
        ctx: OrganizationContext,
        options: ListNotificationsOptions = {},
    ) {
        authorize(ctx, "notification:read");
        await clearStaleLimitNotices(ctx.organizationId);
        const rows = await prisma.notification.findMany({
            where: {
                organizationId: ctx.organizationId,
                ...(options.unreadOnly ? { readAt: null } : {}),
                ...(await this.hiddenFor(ctx)),
            },
            orderBy: { createdAt: "desc" },
        });
        return rows.map((row) => ({ ...row, target: noticeTargetOf(row) }));
    }

    /** Count the org's unread notifications (for a nav badge). */
    async unreadCount(ctx: OrganizationContext): Promise<{ count: number }> {
        authorize(ctx, "notification:read");
        await clearStaleLimitNotices(ctx.organizationId);
        const count = await prisma.notification.count({
            where: {
                organizationId: ctx.organizationId,
                readAt: null,
                ...(await this.hiddenFor(ctx)),
            },
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
     * `notification:write`; scoped to the ctx org. Returns how many were flipped,
     * and the instant they were stamped with: the handle its Undo gives back.
     */
    async markAllRead(
        ctx: OrganizationContext,
    ): Promise<{ updated: number; readAt: string }> {
        authorize(ctx, "notification:write");
        const readAt = new Date();
        const res = await prisma.notification.updateMany({
            where: {
                organizationId: ctx.organizationId,
                readAt: null,
                ...(await this.hiddenFor(ctx)),
            },
            data: { readAt },
        });
        return { updated: res.count, readAt: readAt.toISOString() };
    }

    /**
     * Undo one "Mark all as read": the notices that press stamped, and only
     * those, are unread again. `readAt` is the instant {@link markAllRead}
     * answered with, so a notice read by opening it before or since keeps
     * its mark. Scoped to the ctx org and to what this person sees, as the
     * press was.
     */
    async undoMarkAllRead(
        ctx: OrganizationContext,
        readAt: string,
    ): Promise<{ updated: number }> {
        authorize(ctx, "notification:write");
        const at = new Date(readAt);
        if (Number.isNaN(at.getTime())) return { updated: 0 };
        const res = await prisma.notification.updateMany({
            where: {
                organizationId: ctx.organizationId,
                readAt: at,
                ...(await this.hiddenFor(ctx)),
            },
            data: { readAt: null },
        });
        return { updated: res.count };
    }

    /**
     * The notice types this person doesn't see (F14), as a filter to spread
     * into a query; nothing when they see everything.
     */
    private async hiddenFor(
        ctx: OrganizationContext,
    ): Promise<{ type?: { notIn: string[] } }> {
        const stored = await prisma.notificationPreference.findMany({
            where: {
                organizationId: ctx.organizationId,
                userId: ctx.userId,
                channel: "bell",
            },
            select: { event: true, channel: true, enabled: true },
        });
        const hidden = hiddenNotificationTypes(
            stored,
            (action) => allows(ctx, action),
            ctx.roleKey,
        );
        return hidden.length > 0 ? { type: { notIn: hidden } } : {};
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

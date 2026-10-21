import {
    ForbiddenException,
    Injectable,
    NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { clearStaleLimitNotices } from "../billing/limit-notice-clear";
import { allows } from "../organizations/organization-policy";
import type { StoredPreference } from "./alert-preferences";
import {
    hiddenNotificationTypes,
    hiddenOwnNotificationTypes,
} from "./alert-preferences";
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
 *
 * Two audiences (DEC-170, #1038). A notice with no `userId` is the
 * business's, read with `notification:read` (owners and admins). One with
 * a `userId` is that person's alone — the answer to the booking rules
 * request they made — read with `notification:read-own`, which every role
 * that signs in holds but the Reviewer; nobody else sees it, owners
 * included, and an id of someone else's is a 404. A Member's inbox is
 * their own alerts and nothing of the business's. Opening one of your own,
 * and "Mark all as read" over them, is part of reading them: it needs no
 * `notification:write`.
 */
@Injectable()
export class NotificationsService {
    /** List the org's notifications newest-first; optionally unread-only. */
    async list(
        ctx: OrganizationContext,
        options: ListNotificationsOptions = {},
    ) {
        const seen = this.audience(ctx);
        if (seen.business) await clearStaleLimitNotices(ctx.organizationId);
        const rows = await prisma.notification.findMany({
            where: {
                ...(await this.visibleTo(ctx, seen)),
                ...(options.unreadOnly ? { readAt: null } : {}),
            },
            orderBy: { createdAt: "desc" },
        });
        return rows.map((row) => ({ ...row, target: noticeTargetOf(row) }));
    }

    /** Count the org's unread notifications (for a nav badge). */
    async unreadCount(ctx: OrganizationContext): Promise<{ count: number }> {
        const seen = this.audience(ctx);
        if (seen.business) await clearStaleLimitNotices(ctx.organizationId);
        const count = await prisma.notification.count({
            where: { ...(await this.visibleTo(ctx, seen)), readAt: null },
        });
        return { count };
    }

    /**
     * Mark one notification read. A business notice needs
     * `notification:write`; one's own needs only to be readable. Loads a
     * row this person may see (404 for missing, cross-tenant or someone
     * else's), and stamps `readAt`. Idempotent: an already-read row keeps
     * its original `readAt`.
     */
    async markRead(ctx: OrganizationContext, id: string) {
        const existing = await this.requireOwned(ctx, id);
        if (existing.userId === null && !allows(ctx, "notification:write")) {
            throw new ForbiddenException(
                "Your role can't clear the business's notifications.",
            );
        }
        if (existing.readAt) return existing;
        return prisma.notification.update({
            where: { id: existing.id },
            data: { readAt: new Date() },
        });
    }

    /**
     * Mark every unread notification this person sees read: the business's
     * with `notification:write`, and always their own. Returns how many
     * were flipped, and the instant they were stamped with: the handle its
     * Undo gives back.
     */
    async markAllRead(
        ctx: OrganizationContext,
    ): Promise<{ updated: number; readAt: string }> {
        const readAt = new Date();
        const res = await prisma.notification.updateMany({
            where: {
                ...(await this.visibleTo(ctx, this.clearable(ctx))),
                readAt: null,
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
        const seen = this.clearable(ctx);
        const at = new Date(readAt);
        if (Number.isNaN(at.getTime())) return { updated: 0 };
        const res = await prisma.notification.updateMany({
            where: { ...(await this.visibleTo(ctx, seen)), readAt: at },
            data: { readAt: null },
        });
        return { updated: res.count };
    }

    /**
     * Which notices this person reads: the business's (`notification:read`)
     * and their own (`notification:read-own`). Neither is a 403, as before
     * #1038 a Member was refused the whole inbox.
     */
    private audience(ctx: OrganizationContext): Audience {
        const seen = {
            business: allows(ctx, "notification:read"),
            own: allows(ctx, "notification:read-own"),
        };
        if (!seen.business && !seen.own) {
            throw new ForbiddenException("Your role can't see notifications.");
        }
        return seen;
    }

    /**
     * What "Mark all as read" and its Undo reach: the business's notices
     * only with `notification:write`, and one's own whenever they're read.
     */
    private clearable(ctx: OrganizationContext): Audience {
        const seen = this.audience(ctx);
        const business = seen.business && allows(ctx, "notification:write");
        if (!business && !seen.own) {
            throw new ForbiddenException(
                "Your role can't clear the business's notifications.",
            );
        }
        return { business, own: seen.own };
    }

    /**
     * The rows this person sees, as a filter: this business's, the
     * business-wide ones (less the alert types they turned off, F14) and
     * those addressed to them; never someone else's.
     */
    private async visibleTo(
        ctx: OrganizationContext,
        seen: Audience,
    ): Promise<Prisma.NotificationWhereInput> {
        const either: Prisma.NotificationWhereInput[] = [];
        const stored = await this.bellChoices(ctx);
        if (seen.business) {
            either.push({ userId: null, ...this.hiddenFor(ctx, stored) });
        }
        if (seen.own) {
            // Their own, less a row whose bell they turned off ("Bookings
            // with you", #1138).
            const hidden = hiddenOwnNotificationTypes(stored);
            either.push({
                userId: ctx.userId,
                ...(hidden.length > 0 ? { type: { notIn: hidden } } : {}),
            });
        }
        return { organizationId: ctx.organizationId, OR: either };
    }

    /** This person's own bell choices in this business (F14). */
    private bellChoices(ctx: OrganizationContext) {
        return prisma.notificationPreference.findMany({
            where: {
                organizationId: ctx.organizationId,
                userId: ctx.userId,
                channel: "bell",
            },
            select: { event: true, channel: true, enabled: true },
        });
    }

    /**
     * The notice types this person doesn't see (F14), as a filter to spread
     * into a query; nothing when they see everything.
     */
    private hiddenFor(
        ctx: OrganizationContext,
        stored: readonly StoredPreference[],
    ): { type?: { notIn: string[] } } {
        const hidden = hiddenNotificationTypes(
            stored,
            (action) => allows(ctx, action),
            ctx.roleKey,
        );
        return hidden.length > 0 ? { type: { notIn: hidden } } : {};
    }

    /**
     * Load a notification this person sees. Throws `NotFoundException` for a
     * missing, cross-tenant or someone else's id — a 404 (not 403) so a
     * caller can't probe which notifications exist elsewhere.
     */
    private async requireOwned(ctx: OrganizationContext, id: string) {
        const notification = await prisma.notification.findFirst({
            where: { id, ...(await this.visibleTo(ctx, this.audience(ctx))) },
        });
        if (!notification) {
            throw new NotFoundException("Notification not found");
        }
        return notification;
    }
}

/** Which notices a person reads: the business's, and their own. */
interface Audience {
    business: boolean;
    own: boolean;
}

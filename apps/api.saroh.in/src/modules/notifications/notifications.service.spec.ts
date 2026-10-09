// DB-free unit tests: @saroh/database is mocked so nothing touches Postgres.
jest.mock("@saroh/database", () => ({
    prisma: {
        notification: {
            findMany: jest.fn(),
            findUnique: jest.fn(),
            update: jest.fn(),
            updateMany: jest.fn(),
            count: jest.fn(),
        },
        // F14: the person's own bell choices; none unless a test sets some.
        notificationPreference: { findMany: jest.fn().mockResolvedValue([]) },
    },
}));

// UX-041's clear of stale limit notices is its own spec
// (`billing/limit-notice-clear.spec.ts`); here it clears nothing.
jest.mock("../billing/limit-notice-clear", () => ({
    clearStaleLimitNotices: jest.fn().mockResolvedValue(0),
}));

import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { NotificationsService } from "./notifications.service";

const findMany = prisma.notification.findMany as jest.Mock;
const findUnique = prisma.notification.findUnique as jest.Mock;
const update = prisma.notification.update as jest.Mock;
const updateMany = prisma.notification.updateMany as jest.Mock;
const count = prisma.notification.count as jest.Mock;
const prefFindMany = prisma.notificationPreference.findMany as jest.Mock;

function ctx(over: Partial<OrganizationContext> = {}): OrganizationContext {
    return {
        organizationId: "org_1",
        userId: "user_1",
        role: "ADMIN",
        ...over,
    };
}

describe("NotificationsService.list", () => {
    beforeEach(() => jest.clearAllMocks());

    it("scopes the query to the ctx org, newest first", async () => {
        findMany.mockResolvedValue([]);
        await new NotificationsService().list(ctx());
        expect(findMany).toHaveBeenCalledWith({
            where: { organizationId: "org_1" },
            orderBy: { createdAt: "desc" },
        });
    });

    it("filters to unread when unreadOnly is set", async () => {
        findMany.mockResolvedValue([]);
        await new NotificationsService().list(ctx(), { unreadOnly: true });
        expect(findMany).toHaveBeenCalledWith({
            where: { organizationId: "org_1", readAt: null },
            orderBy: { createdAt: "desc" },
        });
    });

    it("denies a MEMBER (notification:read is OWNER/ADMIN-only) before any I/O", async () => {
        await expect(
            new NotificationsService().list(ctx({ role: "MEMBER" })),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(findMany).not.toHaveBeenCalled();
    });
});

describe("NotificationsService.markRead", () => {
    beforeEach(() => jest.clearAllMocks());

    it("stamps readAt on an owned unread notification", async () => {
        findUnique.mockResolvedValue({
            id: "notif_1",
            organizationId: "org_1",
            readAt: null,
        });
        update.mockResolvedValue({ id: "notif_1", readAt: new Date() });

        await new NotificationsService().markRead(ctx(), "notif_1");

        expect(update).toHaveBeenCalledWith({
            where: { id: "notif_1" },
            data: { readAt: expect.any(Date) },
        });
    });

    it("is idempotent: an already-read notification is not re-stamped", async () => {
        const readAt = new Date("2026-01-01T00:00:00Z");
        findUnique.mockResolvedValue({
            id: "notif_1",
            organizationId: "org_1",
            readAt,
        });

        const res = await new NotificationsService().markRead(ctx(), "notif_1");

        expect(update).not.toHaveBeenCalled();
        expect(res).toMatchObject({ readAt });
    });

    it("rejects a cross-tenant mark-read with 404 and never updates", async () => {
        findUnique.mockResolvedValue({
            id: "notif_1",
            organizationId: "org_OTHER",
            readAt: null,
        });

        await expect(
            new NotificationsService().markRead(ctx(), "notif_1"),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(update).not.toHaveBeenCalled();
    });

    it("404s a missing notification", async () => {
        findUnique.mockResolvedValue(null);
        await expect(
            new NotificationsService().markRead(ctx(), "nope"),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("denies a MEMBER (notification:write is OWNER/ADMIN-only) before any I/O", async () => {
        await expect(
            new NotificationsService().markRead(
                ctx({ role: "MEMBER" }),
                "notif_1",
            ),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(findUnique).not.toHaveBeenCalled();
    });
});

describe("NotificationsService.markAllRead", () => {
    beforeEach(() => jest.clearAllMocks());

    it("marks every unread notification in the ctx org read", async () => {
        updateMany.mockResolvedValue({ count: 3 });

        const res = await new NotificationsService().markAllRead(ctx());

        expect(updateMany).toHaveBeenCalledWith({
            where: { organizationId: "org_1", readAt: null },
            data: { readAt: expect.any(Date) },
        });
        expect(res).toEqual({ updated: 3 });
    });

    it("denies a MEMBER before any I/O", async () => {
        await expect(
            new NotificationsService().markAllRead(ctx({ role: "MEMBER" })),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(updateMany).not.toHaveBeenCalled();
    });
});

describe("NotificationsService.unreadCount", () => {
    beforeEach(() => jest.clearAllMocks());

    it("counts unread notifications scoped to the ctx org", async () => {
        count.mockResolvedValue(2);
        const res = await new NotificationsService().unreadCount(ctx());
        expect(count).toHaveBeenCalledWith({
            where: { organizationId: "org_1", readAt: null },
        });
        expect(res).toEqual({ count: 2 });
    });

    it("denies a MEMBER before any I/O", async () => {
        await expect(
            new NotificationsService().unreadCount(ctx({ role: "MEMBER" })),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(count).not.toHaveBeenCalled();
    });
});

describe("what each person sees of the inbox (F14)", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        prefFindMany.mockResolvedValue([]);
    });

    it("turning the bell off for New order stops that notice reaching them", async () => {
        prefFindMany.mockResolvedValue([
            { event: "order", channel: "bell", enabled: false },
        ]);
        findMany.mockResolvedValue([]);
        count.mockResolvedValue(0);

        await new NotificationsService().list(ctx());
        await new NotificationsService().unreadCount(ctx());

        const hidden = {
            type: { notIn: ["order.new", "order.uncollected"] },
        };
        expect(findMany.mock.calls[0][0].where).toEqual({
            organizationId: "org_1",
            ...hidden,
        });
        expect(count.mock.calls[0][0].where).toEqual({
            organizationId: "org_1",
            readAt: null,
            ...hidden,
        });
    });

    it("reads only the signed-in person's own choices, in this business", async () => {
        findMany.mockResolvedValue([]);
        await new NotificationsService().list(ctx({ userId: "user_9" }));
        expect(prefFindMany.mock.calls[0][0].where).toEqual({
            organizationId: "org_1",
            userId: "user_9",
            channel: "bell",
        });
    });

    it("leaves out notices about what their role can't read", async () => {
        findMany.mockResolvedValue([]);
        // An invented role with the inbox and the team, but no orders,
        // bookings or money, and no say in what goes live.
        await new NotificationsService().list(
            ctx({
                role: "MEMBER",
                actions: new Set(["notification:read", "member:read"]),
            }),
        );
        expect(findMany.mock.calls[0][0].where.type).toEqual({
            notIn: [
                "order.new",
                "order.uncollected",
                "booking.new",
                "booking.moved",
                "booking.cancelled",
                "payment.failed",
                "provider.attention",
                "provider.back",
                "site.live",
                "site.not_live",
                "site.review.approved",
                "site.review.changes",
                "site.review.note",
            ],
        });
    });

    it("Mark all read leaves what they don't see alone", async () => {
        prefFindMany.mockResolvedValue([
            { event: "team", channel: "bell", enabled: false },
        ]);
        updateMany.mockResolvedValue({ count: 1 });
        await new NotificationsService().markAllRead(ctx());
        expect(updateMany.mock.calls[0][0].where).toEqual({
            organizationId: "org_1",
            readAt: null,
            type: { notIn: ["team.joined"] },
        });
    });

    it("never hides an enquiry or a review: they have no switch", async () => {
        prefFindMany.mockResolvedValue(
            ["order", "booking", "failed", "team"].map((event) => ({
                event,
                channel: "bell",
                enabled: false,
            })),
        );
        findMany.mockResolvedValue([]);
        await new NotificationsService().list(ctx());
        const hidden = findMany.mock.calls[0][0].where.type.notIn as string[];
        expect(hidden).not.toContain("enquiry.new");
        expect(hidden).not.toContain("review.needs-reply");
    });
});

// DB-free unit tests: @saroh/database is mocked so nothing touches Postgres.
jest.mock("@saroh/database", () => ({
    prisma: {
        notification: {
            findMany: jest.fn(),
            findFirst: jest.fn(),
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
const findFirst = prisma.notification.findFirst as jest.Mock;
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

/**
 * What an owner or admin sees (DEC-170, #1038): the business's notices
 * (less the types `hidden` names) and those addressed to them.
 */
function seenByAdmin(hidden: object = {}, userId = "user_1") {
    return {
        organizationId: "org_1",
        OR: [{ userId: null, ...hidden }, { userId }],
    };
}

/** What a Member sees: only what is addressed to them. */
function seenByMember(userId = "user_1") {
    return { organizationId: "org_1", OR: [{ userId }] };
}

describe("NotificationsService.list", () => {
    beforeEach(() => jest.clearAllMocks());

    it("scopes the query to the ctx org, newest first", async () => {
        findMany.mockResolvedValue([]);
        await new NotificationsService().list(ctx());
        expect(findMany).toHaveBeenCalledWith({
            where: seenByAdmin(),
            orderBy: { createdAt: "desc" },
        });
    });

    it("says what every row opens: the kind of thing, and its id", async () => {
        findMany.mockResolvedValue([
            { id: "n1", type: "order.new", orderId: "ord_1" },
            { id: "n2", type: "booking.moved", bookingId: "bk_1" },
            { id: "n3", type: "payment.failed", invoiceId: "inv_1" },
            { id: "n4", type: "site.live", siteId: "site_1" },
            { id: "n5", type: "enquiry.new", leadId: "lead_1" },
            { id: "n6", type: "team.joined" },
            // Written before its column existed: the kind's list opens.
            { id: "n7", type: "order.new", orderId: null },
            // A booking rules request opens the person (#1038); one
            // written before it had a person opens the page.
            { id: "n8", type: "hours.rule-request", staffId: "st_1" },
            { id: "n9", type: "hours.rule-answer", staffId: "st_1" },
            { id: "n10", type: "hours.rule-request" },
        ]);
        const rows = await new NotificationsService().list(ctx());
        expect(rows.map((r) => r.target)).toEqual([
            { kind: "order", id: "ord_1" },
            { kind: "booking", id: "bk_1" },
            { kind: "invoice", id: "inv_1" },
            { kind: "site", id: "site_1" },
            { kind: "lead", id: "lead_1" },
            { kind: "team", id: null },
            { kind: "order", id: null },
            { kind: "hours", id: "st_1" },
            { kind: "hours", id: "st_1" },
            { kind: "hours", id: null },
        ]);
    });

    it("filters to unread when unreadOnly is set", async () => {
        findMany.mockResolvedValue([]);
        await new NotificationsService().list(ctx(), { unreadOnly: true });
        expect(findMany).toHaveBeenCalledWith({
            where: { ...seenByAdmin(), readAt: null },
            orderBy: { createdAt: "desc" },
        });
    });

    it("shows a MEMBER only what is addressed to them, never the business's", async () => {
        findMany.mockResolvedValue([]);
        await new NotificationsService().list(ctx({ role: "MEMBER" }));
        expect(findMany).toHaveBeenCalledWith({
            where: seenByMember(),
            orderBy: { createdAt: "desc" },
        });
    });

    it("denies a REVIEWER, who has no bell, before any I/O", async () => {
        await expect(
            new NotificationsService().list(ctx({ role: "REVIEWER" })),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(findMany).not.toHaveBeenCalled();
    });
});

describe("NotificationsService.markRead", () => {
    beforeEach(() => jest.clearAllMocks());

    it("stamps readAt on an owned unread notification", async () => {
        findFirst.mockResolvedValue({
            id: "notif_1",
            organizationId: "org_1",
            userId: null,
            readAt: null,
        });
        update.mockResolvedValue({ id: "notif_1", readAt: new Date() });

        await new NotificationsService().markRead(ctx(), "notif_1");

        expect(update).toHaveBeenCalledWith({
            where: { id: "notif_1" },
            data: { readAt: expect.any(Date) },
        });
        expect(findFirst.mock.calls[0][0].where).toEqual({
            id: "notif_1",
            ...seenByAdmin(),
        });
    });

    it("is idempotent: an already-read notification is not re-stamped", async () => {
        const readAt = new Date("2026-01-01T00:00:00Z");
        findFirst.mockResolvedValue({
            id: "notif_1",
            organizationId: "org_1",
            userId: null,
            readAt,
        });

        const res = await new NotificationsService().markRead(ctx(), "notif_1");

        expect(update).not.toHaveBeenCalled();
        expect(res).toMatchObject({ readAt });
    });

    it("rejects a cross-tenant or someone else's mark-read with 404 and never updates", async () => {
        // The read is scoped to the org and to who it is for, so another
        // business's row, or another person's, is simply not found.
        findFirst.mockResolvedValue(null);

        await expect(
            new NotificationsService().markRead(ctx(), "notif_1"),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(update).not.toHaveBeenCalled();
    });

    it("404s a missing notification", async () => {
        findFirst.mockResolvedValue(null);
        await expect(
            new NotificationsService().markRead(ctx(), "nope"),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("lets a MEMBER open their own: reading it is theirs", async () => {
        findFirst.mockResolvedValue({
            id: "notif_1",
            organizationId: "org_1",
            userId: "user_1",
            readAt: null,
        });
        update.mockResolvedValue({ id: "notif_1" });
        await new NotificationsService().markRead(
            ctx({ role: "MEMBER" }),
            "notif_1",
        );
        expect(findFirst.mock.calls[0][0].where).toEqual({
            id: "notif_1",
            ...seenByMember(),
        });
        expect(update).toHaveBeenCalled();
    });

    it("refuses a business notice to a role that reads but can't clear it", async () => {
        findFirst.mockResolvedValue({
            id: "notif_1",
            organizationId: "org_1",
            userId: null,
            readAt: null,
        });
        await expect(
            new NotificationsService().markRead(
                ctx({
                    role: "MEMBER",
                    actions: new Set(["notification:read"]),
                }),
                "notif_1",
            ),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(update).not.toHaveBeenCalled();
    });

    it("denies a REVIEWER before any I/O", async () => {
        await expect(
            new NotificationsService().markRead(
                ctx({ role: "REVIEWER" }),
                "notif_1",
            ),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(findFirst).not.toHaveBeenCalled();
    });
});

describe("NotificationsService.markAllRead", () => {
    beforeEach(() => jest.clearAllMocks());

    it("marks every unread notification in the ctx org read", async () => {
        updateMany.mockResolvedValue({ count: 3 });

        const res = await new NotificationsService().markAllRead(ctx());

        expect(updateMany).toHaveBeenCalledWith({
            where: { ...seenByAdmin(), readAt: null },
            data: { readAt: expect.any(Date) },
        });
        // The instant it stamped, for its Undo.
        const stamped = updateMany.mock.calls[0][0].data.readAt as Date;
        expect(res).toEqual({ updated: 3, readAt: stamped.toISOString() });
    });

    it("marks only a MEMBER's own read", async () => {
        updateMany.mockResolvedValue({ count: 1 });
        await new NotificationsService().markAllRead(ctx({ role: "MEMBER" }));
        expect(updateMany.mock.calls[0][0].where).toEqual({
            ...seenByMember(),
            readAt: null,
        });
    });

    it("denies a REVIEWER before any I/O", async () => {
        await expect(
            new NotificationsService().markAllRead(ctx({ role: "REVIEWER" })),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(updateMany).not.toHaveBeenCalled();
    });
});

describe("NotificationsService.undoMarkAllRead", () => {
    beforeEach(() => jest.clearAllMocks());

    it("makes unread again only what that press stamped, in the ctx org", async () => {
        updateMany.mockResolvedValue({ count: 3 });
        const at = "2026-10-10T09:30:00.123Z";

        const res = await new NotificationsService().undoMarkAllRead(ctx(), at);

        expect(updateMany).toHaveBeenCalledWith({
            where: { ...seenByAdmin(), readAt: new Date(at) },
            data: { readAt: null },
        });
        expect(res).toEqual({ updated: 3 });
    });

    it("leaves alone what this person doesn't see, as the press did", async () => {
        updateMany.mockResolvedValue({ count: 0 });
        prefFindMany.mockResolvedValueOnce([
            { event: "order", channel: "bell", enabled: false },
        ]);

        await new NotificationsService().undoMarkAllRead(
            ctx(),
            "2026-10-10T09:30:00.123Z",
        );

        expect(updateMany.mock.calls[0][0].where.OR[0].type.notIn).toEqual(
            expect.arrayContaining(["order.new", "order.uncollected"]),
        );
    });

    it("changes nothing for an instant that isn't one", async () => {
        const res = await new NotificationsService().undoMarkAllRead(
            ctx(),
            "yesterday",
        );
        expect(res).toEqual({ updated: 0 });
        expect(updateMany).not.toHaveBeenCalled();
    });

    it("denies a REVIEWER before any I/O", async () => {
        await expect(
            new NotificationsService().undoMarkAllRead(
                ctx({ role: "REVIEWER" }),
                "2026-10-10T09:30:00.123Z",
            ),
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
            where: { ...seenByAdmin(), readAt: null },
        });
        expect(res).toEqual({ count: 2 });
    });

    it("counts only a MEMBER's own", async () => {
        count.mockResolvedValue(1);
        await new NotificationsService().unreadCount(ctx({ role: "MEMBER" }));
        expect(count).toHaveBeenCalledWith({
            where: { ...seenByMember(), readAt: null },
        });
    });

    it("denies a REVIEWER before any I/O", async () => {
        await expect(
            new NotificationsService().unreadCount(ctx({ role: "REVIEWER" })),
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
            type: {
                notIn: ["order.new", "order.uncollected", "order.paid_by_link"],
            },
        };
        expect(findMany.mock.calls[0][0].where).toEqual(seenByAdmin(hidden));
        expect(count.mock.calls[0][0].where).toEqual({
            ...seenByAdmin(hidden),
            readAt: null,
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
        expect(findMany.mock.calls[0][0].where.OR[0].type).toEqual({
            notIn: [
                "order.new",
                "order.uncollected",
                // A team order paid by its link (#1139).
                "order.paid_by_link",
                "booking.new",
                "booking.moved",
                "booking.cancelled",
                "payment.failed",
                "provider.attention",
                "provider.back",
                // An order's payment failed, and money taken at the wrong
                // amount (#1139).
                "order.payment_failed",
                "payment.mismatch",
                "payment.mismatch.invoice",
                // A refund refused or failed (#1143).
                "refund.refused",
                "refund.refused.booking",
                "refund.refused.invoice",
                "refund.failed",
                "refund.failed.booking",
                "refund.failed.invoice",
                "site.live",
                "site.not_live",
                "site.review.approved",
                "site.review.changes",
                "site.review.note",
                "domain.down",
                "domain.back",
                // Only who can run a customer removal sees a request (DEC-172).
                "customer.data-request",
                // Bookings with you (#1138) are personal: never the business's.
                "booking.mine.new",
                "booking.mine.moved",
                "booking.mine.cancelled",
                "booking.reassigned",
                // A member's own changes, to who reads memberships (#1150).
                "member.cancelled",
                "member.paused",
                "member.autopay_off",
                // A rules request, only to who may approve it (#1138).
                "hours.rule-request",
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
            ...seenByAdmin({ type: { notIn: ["team.joined"] } }),
            readAt: null,
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
        const hidden = findMany.mock.calls[0][0].where.OR[0].type
            .notIn as string[];
        expect(hidden).not.toContain("enquiry.new");
        expect(hidden).not.toContain("review.needs-reply");
    });
});

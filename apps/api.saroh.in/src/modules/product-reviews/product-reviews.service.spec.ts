// Product reviews, the business's side: who may be invited, that an
// invitation goes only through the business's own email provider (D11) and
// is recorded as it is queued, that consent is honoured, and that the raw
// token is never stored. Prisma, the send path and env are mocked.
jest.mock("../../env", () => ({
    env: { NODE_ENV: "test", RENDERER_URL: "https://renderer.test" },
}));
jest.mock("../communications/communications.service", () => ({
    CommunicationsService: class {},
}));
jest.mock("../billing/metering.service", () => ({ planMeter: {} }));
jest.mock("../communications/message-send.handler", () => ({
    CANCELLED_DELIVERY: "CANCELLED",
}));
jest.mock("@saroh/database", () => ({
    prisma: {
        $transaction: jest.fn(),
        order: { findFirst: jest.fn(), findMany: jest.fn() },
        reviewInvitation: { upsert: jest.fn() },
        delivery: { updateMany: jest.fn() },
        message: { updateMany: jest.fn(), update: jest.fn() },
        customerIdentityLink: { findMany: jest.fn() },
        contact: { findMany: jest.fn(), findFirst: jest.fn() },
        consent: { findFirst: jest.fn() },
        productReview: {
            findMany: jest.fn(),
            findFirst: jest.fn(),
            update: jest.fn(),
            groupBy: jest.fn(),
        },
        notification: { updateMany: jest.fn() },
    },
}));

import { ConflictException, NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import type { AuditService } from "../audit/audit.service";
import type { CommunicationsService } from "../communications/communications.service";
import { SECRET_LINK_SLOT } from "../communications/transactional";
import { FixedWindowRateLimiter } from "../enquiry/rate-limiter";
import {
    ProductReviewsService,
    REVIEW_NOTICE_TYPE,
} from "./product-reviews.service";
import { hashReviewToken } from "./token";

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const comms = {
    emailConnected: jest.fn(),
    queueTransactional: jest.fn(),
};
/** The secret link the last queued invitation would carry. */
async function queuedLink(call = 0): Promise<string> {
    const input = comms.queueTransactional.mock.calls[call][2] as {
        secretLink: () => Promise<string>;
    };
    return input.secretLink();
}
const send = comms.queueTransactional;
const audit = { record: jest.fn() } as unknown as AuditService;

const ctx: OrganizationContext = {
    organizationId: "org_1",
    userId: "u_1",
    role: "OWNER",
};

const order = (over: Record<string, unknown> = {}) => ({
    id: "o_1",
    organizationId: "org_1",
    status: "DELIVERED",
    paymentStatus: "PAID",
    customerId: "c_1",
    store: { name: "High Street" },
    customer: { email: "ananya@example.com" },
    _count: { items: 2 },
    reviewInvitation: null,
    ...over,
});

const ownEmailRoom = jest.fn();
const make = (limit = 100) => {
    const service = new ProductReviewsService(
        comms as unknown as CommunicationsService,
        audit,
        new FixedWindowRateLimiter(limit, 60_000),
    );
    service.ownEmailRoom = ownEmailRoom;
    return service;
};

/** An order's invitation as the service reads it. */
const invitation = (
    over: {
        completedAt?: Date | null;
        sendCount?: number;
        latest?: string | null;
        accepted?: number;
        reviews?: number;
    } = {},
) => ({
    completedAt: over.completedAt ?? null,
    expiresAt: new Date(Date.now() + 1e9),
    lastSentAt: new Date(),
    sendCount: over.sendCount ?? 0,
    messages:
        over.latest === undefined || over.latest === null
            ? []
            : [{ status: "QUEUED", deliveries: [{ status: over.latest }] }],
    _count: { reviews: over.reviews ?? 0, messages: over.accepted ?? 0 },
});

beforeEach(() => {
    jest.clearAllMocks();
    db.order!.findFirst!.mockResolvedValue(order());
    db.customerIdentityLink!.findMany!.mockResolvedValue([]);
    db.contact!.findMany!.mockResolvedValue([{ id: "ct_1" }]);
    db.consent!.findFirst!.mockResolvedValue(null);
    db.$transaction!.mockImplementation((fn: (tx: unknown) => unknown) =>
        fn(prisma),
    );
    comms.emailConnected.mockResolvedValue(true);
    ownEmailRoom.mockResolvedValue(true);
    db.reviewInvitation!.upsert!.mockResolvedValue({ id: "inv_1" });
    send.mockResolvedValue({
        id: "m_1",
        status: "QUEUED",
        toAddress: "ananya@example.com",
        route: "PROVIDER",
    });
});

describe("invite", () => {
    it("queues the invitation through the business's provider, to the order's customer", async () => {
        const [result] = await make().invite(ctx, ["o_1"]);
        expect(result).toEqual({ orderId: "o_1", status: "queued" });
        const [tx, org, input] = send.mock.calls[0];
        expect(tx).toBe(prisma);
        expect(org).toBe("org_1");
        expect(input).toMatchObject({
            template: "REVIEW_INVITATION",
            recipient: { kind: "ORDER_CUSTOMER", orderId: "o_1" },
            createdByUserId: "u_1",
        });
        expect(input.rendered.subject).toBe(
            "How was your order from High Street?",
        );
        // The stored body holds the slot, never the link.
        expect(input.rendered.body).toContain(SECRET_LINK_SLOT);
        expect(input.rendered.body).not.toContain("/review/");
        expect(audit.record).toHaveBeenCalledWith(
            expect.objectContaining({ action: "product-review.invite" }),
        );
    });

    it("sends a link whose token is stored only as its hash", async () => {
        const [result] = await make().invite(ctx, ["o_1"]);
        const url = await queuedLink();
        const token = url.split("/review/")[1]!;
        expect(url.startsWith("https://renderer.test/review/")).toBe(true);

        const written = db.reviewInvitation!.upsert!.mock.calls[0][0];
        expect(written.create.tokenHash).toBe(hashReviewToken(token));
        expect(written.create.toAddress).toBe("ananya@example.com");
        // The raw token is in the email, and nowhere in what was stored.
        expect(JSON.stringify(written)).not.toContain(token);
        expect(JSON.stringify(result)).not.toContain(token);
    });

    it.each([
        ["not-paid", { paymentStatus: "UNPAID" }],
        ["not-shipped", { status: "PENDING" }],
        ["cancelled", { status: "CANCELLED" }],
        ["refunded", { paymentStatus: "REFUNDED" }],
        ["no-business", { organizationId: null }],
        ["no-email", { customer: { email: "  " } }],
    ] as const)(
        "skips an order that is %s, minting nothing",
        async (reason, over) => {
            db.order!.findFirst!.mockResolvedValue(order(over));
            const [result] = await make().invite(ctx, ["o_1"]);
            expect(result).toMatchObject({ status: "skipped", reason });
            expect(send).not.toHaveBeenCalled();
            expect(db.reviewInvitation!.upsert).not.toHaveBeenCalled();
        },
    );

    it("skips a customer whose contact revoked email consent", async () => {
        db.consent!.findFirst!.mockResolvedValue({ id: "cs_1" });
        const [result] = await make().invite(ctx, ["o_1"]);
        expect(result).toMatchObject({
            status: "skipped",
            reason: "unsubscribed",
        });
        expect(send).not.toHaveBeenCalled();
    });

    it("checks consent on linked contacts AND contacts holding the same email", async () => {
        db.customerIdentityLink!.findMany!.mockResolvedValue([
            { contactId: "ct_linked" },
        ]);
        await make().invite(ctx, ["o_1"]);
        expect(db.contact!.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    organizationId: "org_1",
                    email: {
                        equals: "ananya@example.com",
                        mode: "insensitive",
                    },
                },
            }),
        );
        expect(db.consent!.findFirst).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    contactId: { in: ["ct_linked", "ct_1"] },
                    channel: "EMAIL",
                    status: "REVOKED",
                }),
            }),
        );
    });

    it("says so when there was no contact to check consent against", async () => {
        db.contact!.findMany!.mockResolvedValue([]);
        const [result] = await make().invite(ctx, ["o_1"]);
        expect(result).toEqual({
            orderId: "o_1",
            status: "queued",
            note: "consent-not-checked",
        });
    });

    it("sends nothing without a connected email provider, and says where to connect one", async () => {
        comms.emailConnected.mockResolvedValue(false);
        const [result] = await make().invite(ctx, ["o_1"]);
        expect(result).toEqual({
            orderId: "o_1",
            status: "skipped",
            reason: "no-email-provider",
            message:
                "Review invitations go from your own email. Connect an email provider in Settings › Providers to send them.",
        });
        expect(send).not.toHaveBeenCalled();
        expect(db.reviewInvitation!.upsert).not.toHaveBeenCalled();
    });

    it("on a plan that can't connect its own email, says it needs a paid plan", async () => {
        comms.emailConnected.mockResolvedValue(false);
        ownEmailRoom.mockResolvedValue(false);
        const [result] = await make().invite(ctx, ["o_1"]);
        expect(result).toMatchObject({
            reason: "no-email-provider",
            message:
                "Review invitations go from your own email, and connecting your own email needs a paid plan.",
        });
    });

    it("a plan it couldn't read still offers connecting", async () => {
        comms.emailConnected.mockResolvedValue(false);
        ownEmailRoom.mockRejectedValue(new Error("catalogue down"));
        const [result] = await make().invite(ctx, ["o_1"]);
        expect((result as { message: string }).message).toContain(
            "Connect an email provider",
        );
    });

    it("never counts a skip for no provider against the daily cap", async () => {
        comms.emailConnected.mockResolvedValueOnce(false);
        const results = await make(1).invite(ctx, ["o_1", "o_2"]);
        expect(results.map((r) => r.status)).toEqual(["skipped", "queued"]);
    });

    it("records nothing when the send path's consent gate suppressed it", async () => {
        send.mockResolvedValue({
            id: "m_1",
            status: "SUPPRESSED",
            toAddress: "ananya@example.com",
        });
        const [result] = await make().invite(ctx, ["o_1"]);
        expect(result).toMatchObject({
            status: "skipped",
            reason: "unsubscribed",
        });
        expect(db.reviewInvitation!.upsert).not.toHaveBeenCalled();
        expect(audit.record).not.toHaveBeenCalled();
    });

    it.each([
        [true, "no-email"],
        [false, "no-email-provider"],
    ] as const)(
        "turns the send path's 409 into a skip (provider still connected: %s)",
        async (connected, reason) => {
            send.mockRejectedValue(new ConflictException("no"));
            comms.emailConnected
                .mockResolvedValueOnce(true)
                .mockResolvedValueOnce(connected);
            const [result] = await make().invite(ctx, ["o_1"]);
            expect(result).toMatchObject({ status: "skipped", reason });
            expect(db.reviewInvitation!.upsert).not.toHaveBeenCalled();
        },
    );

    it("lets any other failure through", async () => {
        send.mockRejectedValue(new Error("db down"));
        await expect(make().invite(ctx, ["o_1"])).rejects.toThrow("db down");
    });

    it("a new invitation counts no send until its provider accepts it", async () => {
        await make().invite(ctx, ["o_1"]);
        const written = db.reviewInvitation!.upsert!.mock.calls[0][0];
        expect(written.create.sendCount).toBe(0);
        expect(written.update).not.toHaveProperty("sendCount");
        // The message is tied to the invitation, so its delivery can say.
        expect(db.message!.update).toHaveBeenCalledWith({
            where: { id: "m_1" },
            data: { reviewInvitationId: "inv_1" },
        });
    });

    it("resends by rotating the hash and withdrawing the earlier sends that haven't gone", async () => {
        db.order!.findFirst!.mockResolvedValue(
            order({ reviewInvitation: invitation({ latest: "FAILED" }) }),
        );
        await make().invite(ctx, ["o_1"]);
        const update = db.reviewInvitation!.upsert!.mock.calls[0][0].update;
        const token = (await queuedLink()).split("/review/")[1]!;
        expect(update.tokenHash).toBe(hashReviewToken(token));
        expect(db.delivery!.updateMany).toHaveBeenCalledWith({
            where: {
                message: { reviewInvitationId: "inv_1" },
                status: { in: ["QUEUED", "FAILED"] },
            },
            data: { status: "CANCELLED" },
        });
        // Withdrawn before the new message is tied on, so it never is.
        expect(
            db.delivery!.updateMany!.mock.invocationCallOrder[0]!,
        ).toBeLessThan(db.message!.update!.mock.invocationCallOrder[0]!);
    });

    it.each([
        ["send-limit", invitation({ accepted: 3 })],
        ["send-limit", invitation({ sendCount: 1, accepted: 2 })],
        ["completed", invitation({ completedAt: new Date(), accepted: 1 })],
        ["sending", invitation({ latest: "QUEUED" })],
    ] as const)("refuses to send again when %s", async (reason, inv) => {
        db.order!.findFirst!.mockResolvedValue(
            order({ reviewInvitation: inv }),
        );
        const [result] = await make().invite(ctx, ["o_1"]);
        expect(result).toMatchObject({ status: "skipped", reason });
        expect(send).not.toHaveBeenCalled();
    });

    it("only finds orders in this business", async () => {
        db.order!.findFirst!.mockResolvedValue(null);
        const [result] = await make().invite(ctx, ["o_theirs"]);
        expect(result).toMatchObject({
            status: "skipped",
            reason: "not-found",
        });
        expect(db.order!.findFirst).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: "o_theirs", organizationId: "org_1" },
            }),
        );
    });

    // B13: a walk-in left no email, so there is nobody to invite.
    it("never invites a walk-in, who has no customer and no email", async () => {
        db.order!.findFirst!.mockResolvedValue(
            order({ customerId: null, customer: null, walkInName: "Asha" }),
        );
        const [result] = await make().invite(ctx, ["o_1"]);
        expect(result).toMatchObject({ status: "skipped", reason: "no-email" });
        expect(send).not.toHaveBeenCalled();
        expect(db.reviewInvitation!.upsert).not.toHaveBeenCalled();
    });

    it("offers orders never asked, or whose every send failed", async () => {
        db.order!.findMany!.mockResolvedValue([]);
        await make().invitableOrders("org_1");
        const where = db.order!.findMany!.mock.calls[0][0].where;
        expect(where.OR).toEqual([
            { reviewInvitation: null },
            {
                reviewInvitation: {
                    completedAt: null,
                    sendCount: 0,
                    messages: {
                        none: {
                            deliveries: {
                                some: {
                                    status: {
                                        in: ["SENT", "DELIVERED", "QUEUED"],
                                    },
                                },
                            },
                        },
                    },
                },
            },
        ]);
    });

    it("leaves walk-ins out of the orders it offers to invite", async () => {
        db.order!.findMany!.mockResolvedValue([
            {
                id: "o_1",
                orderId: "1001",
                storeId: "s_1",
                createdAt: new Date("2026-09-20T10:00:00Z"),
                store: { name: "High Street" },
                customer: null,
                _count: { items: 1 },
            },
            {
                id: "o_2",
                orderId: "1002",
                storeId: "s_1",
                createdAt: new Date("2026-09-20T11:00:00Z"),
                store: { name: "High Street" },
                customer: {
                    email: "ananya@example.com",
                    firstName: "Ananya",
                    lastName: null,
                },
                _count: { items: 1 },
            },
        ]);
        const offered = await make().invitableOrders("org_1");
        expect(offered.map((o) => o.id)).toEqual(["o_2"]);
        expect(db.order!.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({ customerId: { not: null } }),
            }),
        );
    });

    it("stops at the business's daily cap", async () => {
        const results = await make(1).invite(ctx, ["o_1", "o_2"]);
        expect(results.map((r) => r.status)).toEqual(["queued", "skipped"]);
        expect(results[1]).toMatchObject({ reason: "daily-limit" });
        expect(send).toHaveBeenCalledTimes(1);
    });

    it("reports each order of a bulk invite in order", async () => {
        db.order!.findFirst!.mockResolvedValueOnce(order())
            .mockResolvedValueOnce(order({ status: "PENDING" }))
            .mockResolvedValueOnce(order());
        const results = await make().invite(ctx, ["a", "b", "c"]);
        expect(results.map((r) => [r.orderId, r.status])).toEqual([
            ["a", "queued"],
            ["b", "skipped"],
            ["c", "queued"],
        ]);
    });
});

describe("invitationState", () => {
    it.each([
        ["sending", invitation({ latest: "QUEUED" }), 0],
        ["failed", invitation({ latest: "FAILED" }), 0],
        ["failed", invitation({ latest: "BOUNCED", accepted: 1 }), 1],
        ["sent", invitation({ latest: "SENT", accepted: 1 }), 1],
        ["sent", invitation({ latest: "DELIVERED", accepted: 2 }), 2],
        // Saroh's sender, before D11: recorded only once it had left.
        ["sent", invitation({ sendCount: 1 }), 1],
    ] as const)(
        "reads %s from the latest send's delivery",
        async (state, inv, sends) => {
            db.order!.findFirst!.mockResolvedValue(
                order({ reviewInvitation: inv }),
            );
            const read = await make().invitationState("org_1", "o_1");
            expect(read.state).toBe(state);
            expect(read.sendCount).toBe(sends);
        },
    );

    it("a failed send leaves the order open to resend", async () => {
        db.order!.findFirst!.mockResolvedValue(
            order({ reviewInvitation: invitation({ latest: "FAILED" }) }),
        );
        const read = await make().invitationState("org_1", "o_1");
        expect(read.blocked).toBeNull();
        expect(read.email).toEqual({ connected: true, canConnect: null });
    });

    it("says it needs a paid plan where the plan can't connect email", async () => {
        comms.emailConnected.mockResolvedValue(false);
        ownEmailRoom.mockResolvedValue(false);
        const read = await make().invitationState("org_1", "o_1");
        expect(read.email).toEqual({ connected: false, canConnect: false });
        expect(read.blocked?.message).toBe(
            "Review invitations go from your own email, and connecting your own email needs a paid plan.",
        );
    });

    it("blocks an invitable order when the business has no email provider", async () => {
        comms.emailConnected.mockResolvedValue(false);
        const state = await make().invitationState("org_1", "o_1");
        expect(state.state).toBe("none");
        expect(state.blocked).toMatchObject({ reason: "no-email-provider" });
    });

    it("leaves it open when the provider is connected", async () => {
        const state = await make().invitationState("org_1", "o_1");
        expect(state.blocked).toBeNull();
    });

    it("names the order's own reason first", async () => {
        comms.emailConnected.mockResolvedValue(false);
        db.order!.findFirst!.mockResolvedValue(order({ status: "PENDING" }));
        const state = await make().invitationState("org_1", "o_1");
        expect(state.blocked).toMatchObject({ reason: "not-shipped" });
    });
});

describe("reply and hide", () => {
    const row = {
        id: "r_1",
        organizationId: "org_1",
        storeId: "st_1",
        rating: 2,
        body: "Box arrived crushed",
        displayName: "Ananya R.",
        productId: "p_1",
        productName: "Mailer box",
        invitedTo: "ananya@example.com",
        status: "PUBLISHED",
        reply: null,
        repliedAt: null,
        createdAt: new Date(),
    };

    beforeEach(() => {
        db.productReview!.findFirst!.mockResolvedValue(row);
    });

    it("first reply sets repliedAt and clears the review's notice", async () => {
        await make().reply(ctx, "r_1", "Sorry — a new one is on its way.");
        expect(db.productReview!.update).toHaveBeenCalledWith({
            where: { id: "r_1" },
            data: {
                reply: "Sorry — a new one is on its way.",
                repliedAt: expect.any(Date),
            },
        });
        expect(db.notification!.updateMany).toHaveBeenCalledWith({
            where: {
                organizationId: "org_1",
                reviewId: "r_1",
                type: REVIEW_NOTICE_TYPE,
                readAt: null,
            },
            data: { readAt: expect.any(Date) },
        });
        expect(audit.record).toHaveBeenCalledWith(
            expect.objectContaining({ action: "product-review.reply" }),
        );
    });

    it("an edited reply keeps its first date", async () => {
        db.productReview!.findFirst!.mockResolvedValue({
            ...row,
            repliedAt: new Date(),
        });
        await make().reply(ctx, "r_1", "Edited");
        expect(db.productReview!.update.mock.calls[0][0].data).toEqual({
            reply: "Edited",
            replyUpdatedAt: expect.any(Date),
        });
    });

    it("hiding clears the notice; unhiding does not raise it again", async () => {
        await make().setHidden(ctx, "r_1", true);
        expect(db.notification!.updateMany).toHaveBeenCalledTimes(1);
        await make().setHidden(ctx, "r_1", false);
        expect(db.notification!.updateMany).toHaveBeenCalledTimes(1);
        expect(db.productReview!.update.mock.calls[1][0].data).toEqual({
            status: "PUBLISHED",
            hiddenAt: null,
            hiddenByUserId: null,
        });
    });

    it("404s another business's review", async () => {
        db.productReview!.findFirst!.mockResolvedValue(null);
        await expect(make().setHidden(ctx, "r_x", true)).rejects.toThrow(
            NotFoundException,
        );
        expect(db.productReview!.update).not.toHaveBeenCalled();
    });
});

describe("list by contact (C6)", () => {
    beforeEach(() => {
        db.contact!.findFirst!.mockResolvedValue({
            email: "asha@example.com",
            removedAt: null,
        });
        db.productReview!.findMany!.mockResolvedValue([]);
    });

    it("reads the reviews of every store customer linked to them", async () => {
        db.customerIdentityLink!.findMany!.mockResolvedValue([
            { customerId: "cu_1" },
            { customerId: "cu_2" },
        ]);
        await make().list("org_1", { contactId: "ct_1" });
        expect(db.contact!.findFirst!.mock.calls[0][0].where).toEqual({
            id: "ct_1",
            organizationId: "org_1",
        });
        expect(
            db.customerIdentityLink!.findMany!.mock.calls[0][0].where,
        ).toEqual({ organizationId: "org_1", contactId: "ct_1" });
        const where = db.productReview!.findMany!.mock.calls[0][0].where;
        expect(where.organizationId).toBe("org_1");
        expect(where.OR).toEqual([
            { customerId: { in: ["cu_1", "cu_2"] } },
            {
                customerId: null,
                invitation: {
                    order: { customerId: { in: ["cu_1", "cu_2"] } },
                },
            },
        ]);
    });

    it("never matches by email: no link, no reviews, and no query", async () => {
        db.customerIdentityLink!.findMany!.mockResolvedValue([]);
        expect(await make().list("org_1", { contactId: "ct_1" })).toEqual([]);
        expect(db.productReview!.findMany).not.toHaveBeenCalled();
    });

    it("shows nothing for a customer removed for a privacy request", async () => {
        db.contact!.findFirst!.mockResolvedValue({
            email: "removed+ct_1@removed.invalid",
            removedAt: new Date(),
        });
        db.customerIdentityLink!.findMany!.mockResolvedValue([
            { customerId: "cu_1" },
        ]);
        expect(await make().list("org_1", { contactId: "ct_1" })).toEqual([]);
        expect(db.productReview!.findMany).not.toHaveBeenCalled();
    });

    it("404s a contact in another business", async () => {
        db.contact!.findFirst!.mockResolvedValue(null);
        await expect(
            make().list("org_1", { contactId: "ct_x" }),
        ).rejects.toThrow(NotFoundException);
        expect(db.productReview!.findMany).not.toHaveBeenCalled();
    });

    it("leaves the product page's list as it was", async () => {
        await make().list("org_1", { productId: "p_1" });
        expect(db.contact!.findFirst).not.toHaveBeenCalled();
        expect(db.productReview!.findMany!.mock.calls[0][0].where).toEqual({
            organizationId: "org_1",
            productId: "p_1",
        });
    });
});

describe("summary", () => {
    it("averages published reviews only", async () => {
        db.productReview!.groupBy!.mockResolvedValue([
            { productId: "p_1", _avg: { rating: 4.5555 }, _count: { _all: 9 } },
        ]);
        expect(await make().summary("org_1")).toEqual([
            { productId: "p_1", average: 4.6, count: 9 },
        ]);
        expect(db.productReview!.groupBy.mock.calls[0][0].where).toEqual({
            organizationId: "org_1",
            status: "PUBLISHED",
            productId: { not: null },
        });
    });
});

// Product reviews, the business's side: who may be invited, that nothing is
// recorded until the email has left, that consent is honoured, and that the
// raw token is never stored. Prisma, the email sender and env are mocked.
jest.mock("../../env", () => ({
    env: { NODE_ENV: "test", RENDERER_URL: "https://renderer.test" },
}));
jest.mock("../../common/email", () => ({
    sendReviewInvitationEmail: jest.fn(),
}));
jest.mock("@saroh/database", () => ({
    prisma: {
        order: { findFirst: jest.fn(), findMany: jest.fn() },
        reviewInvitation: { upsert: jest.fn() },
        customerIdentityLink: { findMany: jest.fn() },
        contact: { findMany: jest.fn() },
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

import { NotFoundException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import { sendReviewInvitationEmail } from "../../common/email";
import type { OrganizationContext } from "../../common/types/organization-context";
import type { AuditService } from "../audit/audit.service";
import { FixedWindowRateLimiter } from "../enquiry/rate-limiter";
import {
    ProductReviewsService,
    REVIEW_NOTICE_TYPE,
} from "./product-reviews.service";
import { hashReviewToken } from "./token";

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const send = sendReviewInvitationEmail as jest.Mock;
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

const make = (limit = 100) =>
    new ProductReviewsService(audit, new FixedWindowRateLimiter(limit, 60_000));

beforeEach(() => {
    jest.clearAllMocks();
    db.order!.findFirst!.mockResolvedValue(order());
    db.customerIdentityLink!.findMany!.mockResolvedValue([]);
    db.contact!.findMany!.mockResolvedValue([{ id: "ct_1" }]);
    db.consent!.findFirst!.mockResolvedValue(null);
    send.mockResolvedValue("sent");
});

describe("invite", () => {
    it("emails a link whose token is stored only as its hash", async () => {
        const [result] = await make().invite(ctx, ["o_1"]);
        expect(result).toEqual({ orderId: "o_1", status: "sent" });

        const [to, url, store] = send.mock.calls[0] as [string, string, string];
        expect(to).toBe("ananya@example.com");
        expect(store).toBe("High Street");
        const token = url.split("/review/")[1]!;
        expect(url.startsWith("https://renderer.test/review/")).toBe(true);

        const written = db.reviewInvitation!.upsert!.mock.calls[0][0];
        expect(written.create.tokenHash).toBe(hashReviewToken(token));
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
            status: "sent",
            note: "consent-not-checked",
        });
    });

    it.each([
        ["not-configured", "email-unavailable"],
        ["failed", "email-failed"],
    ] as const)(
        "records nothing when the email was %s",
        async (outcome, reason) => {
            send.mockResolvedValue(outcome);
            const [result] = await make().invite(ctx, ["o_1"]);
            expect(result).toMatchObject({ status: "skipped", reason });
            expect(db.reviewInvitation!.upsert).not.toHaveBeenCalled();
        },
    );

    it("resends by rotating the hash and counting the send", async () => {
        db.order!.findFirst!.mockResolvedValue(
            order({
                reviewInvitation: {
                    completedAt: null,
                    expiresAt: new Date(Date.now() + 1e9),
                    lastSentAt: new Date(),
                    sendCount: 1,
                    _count: { reviews: 0 },
                },
            }),
        );
        await make().invite(ctx, ["o_1"]);
        const update = db.reviewInvitation!.upsert!.mock.calls[0][0].update;
        expect(update.tokenHash).toMatch(/^[0-9a-f]{64}$/);
        expect(update.sendCount).toEqual({ increment: 1 });
    });

    it.each([
        ["send-limit", { completedAt: null, sendCount: 3 }],
        ["completed", { completedAt: new Date(), sendCount: 1 }],
    ] as const)("refuses to send again when %s", async (reason, inv) => {
        db.order!.findFirst!.mockResolvedValue(
            order({
                reviewInvitation: {
                    ...inv,
                    expiresAt: new Date(Date.now() + 1e9),
                    lastSentAt: new Date(),
                    _count: { reviews: 2 },
                },
            }),
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

    it("stops at the business's daily cap", async () => {
        const results = await make(1).invite(ctx, ["o_1", "o_2"]);
        expect(results.map((r) => r.status)).toEqual(["sent", "skipped"]);
        expect(results[1]).toMatchObject({ reason: "daily-limit" });
        expect(send).toHaveBeenCalledTimes(1);
    });

    it("reports each order of a bulk invite in order", async () => {
        db.order!.findFirst!.mockResolvedValueOnce(order())
            .mockResolvedValueOnce(order({ status: "PENDING" }))
            .mockResolvedValueOnce(order());
        const results = await make().invite(ctx, ["a", "b", "c"]);
        expect(results.map((r) => [r.orderId, r.status])).toEqual([
            ["a", "sent"],
            ["b", "skipped"],
            ["c", "sent"],
        ]);
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

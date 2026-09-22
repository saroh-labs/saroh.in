// The customer's side of a review link: no session, so the token is the only
// key — found by its hash, never trusted for anything else. Prisma is mocked;
// `$transaction` runs its callback against the same mocked client.
jest.mock("@saroh/database", () => {
    const actual = jest.requireActual("@saroh/database");
    const client = {
        reviewInvitation: {
            findUnique: jest.fn(),
            updateMany: jest.fn(),
            update: jest.fn(),
        },
        order: { findFirst: jest.fn() },
        productReview: {
            findMany: jest.fn(),
            create: jest.fn(),
            count: jest.fn(),
        },
        notification: { create: jest.fn() },
        site: { findFirst: jest.fn() },
    };
    return {
        ...actual,
        runInOrgContext: jest.fn((_org: string, fn: () => unknown) => fn()),
        prisma: {
            ...client,
            $transaction: jest.fn((cb: (tx: typeof client) => unknown) =>
                cb(client),
            ),
        },
    };
});

import {
    ConflictException,
    GoneException,
    NotFoundException,
} from "@nestjs/common";
import { Prisma, prisma, runInOrgContext } from "@saroh/database";

import { FixedWindowRateLimiter } from "../enquiry/rate-limiter";
import { REVIEW_NOTICE_TYPE } from "./product-reviews.service";
import { PublicProductReviewsService } from "./public-product-reviews.service";
import { hashReviewToken } from "./token";

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const TOKEN = "tok_abc";

const invitation = (over: Record<string, unknown> = {}) => ({
    id: "inv_1",
    organizationId: "org_1",
    orderId: "o_1",
    toAddress: "ananya@example.com",
    expiresAt: new Date(Date.now() + 1e9),
    completedAt: null,
    ...over,
});

const theOrder = (over: Record<string, unknown> = {}) => ({
    organizationId: "org_1",
    storeId: "st_1",
    customerId: "c_1",
    status: "DELIVERED",
    paymentStatus: "PAID",
    store: { name: "High Street" },
    customer: {
        email: "ananya@example.com",
        firstName: "Ananya",
        lastName: "rao",
    },
    items: [
        {
            id: "oi_1",
            productId: "p_1",
            product: { name: "Mailer box", image: null },
        },
        {
            id: "oi_2",
            productId: "p_2",
            product: { name: "Tape", image: "t.png" },
        },
        {
            id: "oi_3",
            productId: "p_3",
            product: { name: "Labels", image: null },
        },
    ],
    ...over,
});

const post = (over: Record<string, unknown> = {}) => ({
    orderItemId: "oi_1",
    rating: 5,
    displayName: "Ananya R.",
    ...over,
});

const make = (limit = 100) =>
    new PublicProductReviewsService(new FixedWindowRateLimiter(limit, 60_000));

beforeEach(() => {
    jest.clearAllMocks();
    db.reviewInvitation!.findUnique!.mockResolvedValue(invitation());
    db.reviewInvitation!.updateMany!.mockResolvedValue({ count: 1 });
    db.order!.findFirst!.mockResolvedValue(theOrder());
    db.productReview!.findMany!.mockResolvedValue([]);
    db.productReview!.create!.mockResolvedValue({ id: "r_1" });
    db.productReview!.count!.mockResolvedValue(1);
    db.site!.findFirst!.mockResolvedValue(null);
});

describe("tenancy — the invitation is the only key", () => {
    it("finds the invitation by the token's hash, then works inside its business", async () => {
        await make().read(TOKEN);
        expect(db.reviewInvitation!.findUnique).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { tokenHash: hashReviewToken(TOKEN) },
            }),
        );
        expect(runInOrgContext).toHaveBeenCalledWith(
            "org_1",
            expect.any(Function),
        );
        expect(db.order!.findFirst).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: "o_1", organizationId: "org_1" },
            }),
        );
    });

    it("404s a line that is not on the invitation's own order, creating nothing", async () => {
        await expect(
            make().submit(
                TOKEN,
                post({ orderItemId: "oi_from_another_order" }),
            ),
        ).rejects.toThrow(NotFoundException);
        expect(db.productReview!.create).not.toHaveBeenCalled();
    });

    it("takes the business, product and customer from the rows, not the body", async () => {
        await make().submit(TOKEN, {
            ...post(),
            // Anything else in a body is ignored; the DTO only admits the four.
        });
        expect(db.productReview!.create.mock.calls[0][0].data).toMatchObject({
            organizationId: "org_1",
            storeId: "st_1",
            invitationId: "inv_1",
            orderItemId: "oi_1",
            productId: "p_1",
            productName: "Mailer box",
            customerId: "c_1",
            invitedTo: "ananya@example.com",
        });
    });
});

describe("read", () => {
    it("exposes only what a reviewer needs", async () => {
        db.productReview!.findMany!.mockResolvedValue([
            { orderItemId: "oi_2" },
        ]);
        const view = await make().read(TOKEN);
        expect(Object.keys(view).sort()).toEqual([
            "lines",
            "storeName",
            "suggestedName",
            "theme",
        ]);
        expect(Object.keys(view.lines[0]!).sort()).toEqual([
            "image",
            "orderItemId",
            "productName",
            "reviewed",
        ]);
        expect(JSON.stringify(view)).not.toMatch(/ananya@|o_1|c_1|price|total/);
        expect(view.lines.map((l) => l.reviewed)).toEqual([false, true, false]);
        expect(view.suggestedName).toBe("Ananya R.");
    });

    it("suggests 'Verified buyer' when there is no first name", async () => {
        db.order!.findFirst!.mockResolvedValue(
            theOrder({
                customer: { email: "x@y.z", firstName: null, lastName: null },
            }),
        );
        expect((await make().read(TOKEN)).suggestedName).toBe("Verified buyer");
    });

    it("404s an unknown token", async () => {
        db.reviewInvitation!.findUnique!.mockResolvedValue(null);
        await expect(make().read("nope")).rejects.toThrow(NotFoundException);
    });

    it.each([
        ["expired", { expiresAt: new Date(Date.now() - 1000) }],
        ["completed", { completedAt: new Date() }],
    ] as const)(
        "410s a link that has %s, with the reason",
        async (reason, over) => {
            db.reviewInvitation!.findUnique!.mockResolvedValue(
                invitation(over),
            );
            const err = (await make()
                .read(TOKEN)
                .catch((e: unknown) => e)) as GoneException;
            expect(err).toBeInstanceOf(GoneException);
            expect(err.getResponse()).toMatchObject({ details: { reason } });
        },
    );

    it("410s once the order is refunded, even with a live link", async () => {
        db.order!.findFirst!.mockResolvedValue(
            theOrder({ paymentStatus: "REFUNDED" }),
        );
        const err = (await make()
            .read(TOKEN)
            .catch((e: unknown) => e)) as GoneException;
        expect(err.getResponse()).toMatchObject({
            details: { reason: "not-eligible" },
        });
    });
});

describe("submit", () => {
    it("posts one line and leaves the link open for the rest", async () => {
        db.productReview!.count!.mockResolvedValue(1);
        expect(await make().submit(TOKEN, post())).toEqual({
            orderItemId: "oi_1",
            completed: false,
        });
        expect(db.reviewInvitation!.update).not.toHaveBeenCalled();
    });

    it("the last line completes the invitation", async () => {
        db.productReview!.count!.mockResolvedValue(3);
        expect(
            await make().submit(TOKEN, post({ orderItemId: "oi_3" })),
        ).toEqual({
            orderItemId: "oi_3",
            completed: true,
        });
        expect(db.reviewInvitation!.update).toHaveBeenCalledWith({
            where: { id: "inv_1" },
            data: { completedAt: expect.any(Date) },
        });
    });

    it("locks the invitation first, and refuses if it closed in between", async () => {
        db.reviewInvitation!.updateMany!.mockResolvedValue({ count: 0 });
        await expect(make().submit(TOKEN, post())).rejects.toThrow(
            GoneException,
        );
        expect(db.productReview!.create).not.toHaveBeenCalled();
        expect(
            db.reviewInvitation!.updateMany.mock.calls[0][0].where,
        ).toMatchObject({
            id: "inv_1",
            organizationId: "org_1",
            completedAt: null,
        });
    });

    it("answers a second post for the same line with 'already reviewed'", async () => {
        db.productReview!.create!.mockRejectedValue(
            new Prisma.PrismaClientKnownRequestError("dup", {
                code: "P2002",
                clientVersion: "x",
            }),
        );
        await expect(make().submit(TOKEN, post())).rejects.toThrow(
            ConflictException,
        );
    });

    it("strips control and bidi-override characters from the text", async () => {
        const rlo = String.fromCharCode(0x202e);
        const nul = String.fromCharCode(0);
        await make().submit(
            TOKEN,
            post({
                body: `  Great${rlo} box${nul}  `,
                displayName: `Ana${rlo}nya`,
            }),
        );
        const data = db.productReview!.create.mock.calls[0][0].data;
        expect(data.body).toBe("Great box");
        expect(data.displayName).toBe("Ananya");
    });

    it("refuses the eleventh post in the window", async () => {
        const service = make(1);
        await service.submit(TOKEN, post());
        await expect(
            service.submit(TOKEN, post({ orderItemId: "oi_2" })),
        ).rejects.toMatchObject({
            status: 429,
        });
    });
});

describe("the review notice (U10)", () => {
    it.each([
        ["a 5-star review with no text", 5, undefined, false],
        ["a 2-star review with no text", 2, undefined, true],
        ["a 5-star review with text", 5, "Lovely", true],
    ] as const)("%s → notice: %s", async (_label, rating, body, notice) => {
        await make().submit(TOKEN, post({ rating, body }));
        if (notice) {
            expect(db.notification!.create).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    organizationId: "org_1",
                    type: REVIEW_NOTICE_TYPE,
                    reviewId: "r_1",
                }),
            });
        } else {
            expect(db.notification!.create).not.toHaveBeenCalled();
        }
    });
});

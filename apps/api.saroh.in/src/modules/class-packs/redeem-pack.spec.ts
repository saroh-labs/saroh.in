import { BadRequestException, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@saroh/database";

import { redeemPackInTx } from "./redeem-pack";

/**
 * Spending a pack's class, as the team and as the customer (A10). Mocked
 * transaction; the real rows and the race are in
 * `bookings/public-booking-credit.db.spec.ts` and `class-packs.db.spec.ts`.
 */

const findFirst = jest.fn();
const count = jest.fn();
const findUnique = jest.fn();
const create = jest.fn();
const updateMany = jest.fn();
const moduleFind = jest.fn();
const queryRaw = jest.fn();
const tx = {
    packPurchase: { findFirst, findMany: jest.fn() },
    packRedemption: { count, findUnique, create, update: jest.fn() },
    booking: { updateMany },
    organizationModule: { findFirst: moduleFind },
    $queryRaw: queryRaw,
} as unknown as Prisma.TransactionClient;

const SPEND = {
    organizationId: "org_1",
    bookingId: "b_1",
    contactId: "c_1",
    serviceId: "svc_hiit",
    startAt: new Date("2026-10-05T07:00:00Z"),
    purchaseId: "pp_1",
};

function purchase(over: Record<string, unknown> = {}) {
    return {
        id: "pp_1",
        contactId: "c_1",
        credits: 5,
        expiresAt: new Date("2026-12-01T00:00:00Z"),
        pack: { name: "5 classes", services: [{ serviceId: "svc_hiit" }] },
        ...over,
    };
}

beforeEach(() => {
    jest.clearAllMocks();
    findFirst.mockResolvedValue(purchase());
    count.mockResolvedValue(0);
    findUnique.mockResolvedValue(null);
    moduleFind.mockResolvedValue(null);
    queryRaw.mockResolvedValue([]);
});

describe("a customer spending their own pack online (A10)", () => {
    it("spends the pack they named and says the booking is paid with it", async () => {
        await expect(
            redeemPackInTx(tx, { ...SPEND, actor: "customer" }),
        ).resolves.toEqual({ purchaseId: "pp_1", packName: "5 classes" });
        expect(create).toHaveBeenCalledWith({
            data: {
                organizationId: "org_1",
                purchaseId: "pp_1",
                bookingId: "b_1",
            },
        });
        expect(updateMany).toHaveBeenCalledWith({
            where: { id: "b_1" },
            data: { paidWith: "PACK", subscriptionId: null },
        });
    });

    it("treats someone else's pack as missing: 404, credit-gone", async () => {
        findFirst.mockResolvedValue(purchase({ contactId: "c_other" }));
        const err = await redeemPackInTx(tx, {
            ...SPEND,
            actor: "customer",
        }).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(NotFoundException);
        expect((err as NotFoundException).getResponse()).toMatchObject({
            details: { reason: "credit-gone" },
        });
        expect(create).not.toHaveBeenCalled();
    });

    it("never spends 'whichever pack' for a customer: one must be named", async () => {
        await expect(
            redeemPackInTx(tx, {
                ...SPEND,
                purchaseId: undefined,
                actor: "customer",
            }),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("refuses the last class already spent, in their words", async () => {
        count.mockResolvedValue(5);
        await expect(
            redeemPackInTx(tx, { ...SPEND, actor: "customer" }),
        ).rejects.toMatchObject({
            response: {
                message: "Your class pack has no classes left.",
                details: { field: "packPurchaseId", reason: "credit-gone" },
            },
        });
    });

    it("refuses a pack that runs out before the class", async () => {
        findFirst.mockResolvedValue(
            purchase({ expiresAt: new Date("2026-10-05T07:00:00Z") }),
        );
        await expect(
            redeemPackInTx(tx, { ...SPEND, actor: "customer" }),
        ).rejects.toThrow("Your class pack runs out before this class.");
    });

    it("refuses while the business has Class packs off", async () => {
        moduleFind.mockResolvedValue({ id: "mod_1" });
        await expect(
            redeemPackInTx(tx, { ...SPEND, actor: "customer" }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(findFirst).not.toHaveBeenCalled();
    });
});

describe("the team spending a pack at the desk, as before", () => {
    it("says whose it is: 400, with no credit-gone reason", async () => {
        findFirst.mockResolvedValue(purchase({ contactId: "c_other" }));
        await expect(redeemPackInTx(tx, SPEND)).rejects.toMatchObject({
            response: {
                message: "That class pack belongs to someone else.",
                details: { field: "packPurchaseId" },
            },
        });
    });

    it("spends a pack even with Class packs off: a pack already sold stays usable", async () => {
        moduleFind.mockResolvedValue({ id: "mod_1" });
        await expect(redeemPackInTx(tx, SPEND)).resolves.toMatchObject({
            purchaseId: "pp_1",
        });
    });
});

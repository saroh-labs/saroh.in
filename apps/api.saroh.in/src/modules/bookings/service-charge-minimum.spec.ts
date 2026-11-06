// A service's online charge against Stripe's minimum (DEC-208): its deposit
// when it takes one, else its price, refused under the field that sets it.
jest.mock("@saroh/database", () => ({
    ...jest.requireActual("@saroh/database"),
    prisma: { merchantPaymentProvider: { count: jest.fn() } },
}));

import { BadRequestException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import { assertServiceChargeTakes } from "./service-fields";

const count = prisma.merchantPaymentProvider.count as jest.Mock;

beforeEach(() => {
    jest.clearAllMocks();
    count.mockResolvedValue(1);
});

async function fieldOf(promise: Promise<unknown>): Promise<unknown> {
    const err = await promise.catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    return (
        (err as BadRequestException).getResponse() as {
            details: { field: string };
        }
    ).details.field;
}

describe("assertServiceChargeTakes", () => {
    it("refuses a deposit under the minimum, under depositMode", async () => {
        // A quarter of $1.00 is $0.25.
        await expect(
            fieldOf(
                assertServiceChargeTakes("org_1", 100, "PERCENT_25", "USD"),
            ),
        ).resolves.toBe("depositMode");
    });

    it("refuses a price under the minimum, under priceCents", async () => {
        await expect(
            fieldOf(assertServiceChargeTakes("org_1", 30, "NONE", "USD")),
        ).resolves.toBe("priceCents");
    });

    it("takes a deposit at the minimum", async () => {
        await expect(
            assertServiceChargeTakes("org_1", 200, "PERCENT_25", "USD"),
        ).resolves.toBeUndefined();
    });

    it("takes anything from a business not on Stripe", async () => {
        count.mockResolvedValue(0);
        await expect(
            assertServiceChargeTakes("org_1", 30, "NONE", "INR"),
        ).resolves.toBeUndefined();
    });
});

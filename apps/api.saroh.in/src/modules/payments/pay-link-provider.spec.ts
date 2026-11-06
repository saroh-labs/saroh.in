// Which provider takes a pay link's payment (B11), as far as the business's
// edition goes (DEC-208): a connection outside it reads as not connected.
// The database is a hand-made double; the filters themselves are Prisma's.
import { ConflictException } from "@nestjs/common";

import { businessPayLinkProvider, payLinkProvider } from "./pay-link-provider";
import { IN_EDITION, OPENS_CHECKOUT } from "./public-key";

function db(over: {
    pinned?: string | null;
    row?: unknown;
    first?: unknown[];
}) {
    const findFirst = jest.fn();
    for (const r of over.first ?? []) findFirst.mockResolvedValueOnce(r);
    return {
        storeSettings: {
            findUnique: jest.fn().mockResolvedValue({
                checkoutProvider: over.pinned ?? null,
            }),
        },
        merchantPaymentProvider: {
            findUnique: jest.fn().mockResolvedValue(over.row ?? null),
            findFirst,
        },
    };
}

const STRIPE = {
    provider: "STRIPE",
    status: "CONNECTED",
    publicKey: "pk_test_Madeup1",
};

describe("the pay link's provider and the business's edition (DEC-208)", () => {
    it("asks for a storefront's pinned provider only within the edition", async () => {
        const d = db({ pinned: "stripe", row: STRIPE });

        await expect(
            payLinkProvider(d as never, "org_1", "st_1"),
        ).resolves.toBe(STRIPE);
        expect(d.merchantPaymentProvider.findUnique).toHaveBeenCalledWith({
            where: {
                organizationId_provider: {
                    organizationId: "org_1",
                    provider: "STRIPE",
                },
                ...IN_EDITION,
            },
        });
    });

    it("reads a pinned provider outside the edition as not connected", async () => {
        // Outside the edition, the filtered read finds nothing.
        const d = db({ pinned: "RAZORPAY", row: null });

        await expect(
            payLinkProvider(d as never, "org_1", "st_1"),
        ).rejects.toThrow(
            new ConflictException(
                "This location takes payment through Razorpay, which isn't connected. Connect it, or pick another in Sell › Locations.",
            ),
        );
    });

    it("falls back to the first connection the edition takes, and says none when there is none", async () => {
        const d = db({ first: [null, null] });

        await expect(
            businessPayLinkProvider(d as never, "org_1"),
        ).rejects.toThrow("Connect a payment provider to send a pay link.");
        expect(
            d.merchantPaymentProvider.findFirst.mock.calls[0][0].where,
        ).toEqual({
            organizationId: "org_1",
            status: "CONNECTED",
            ...OPENS_CHECKOUT,
        });
        expect(
            d.merchantPaymentProvider.findFirst.mock.calls[1][0].where,
        ).toEqual({
            organizationId: "org_1",
            status: "CONNECTED",
            ...IN_EDITION,
        });
    });

    it("lets each edition's filter name only its own providers", () => {
        expect(IN_EDITION.OR).toEqual([
            {
                organization: { edition: "INDIA" },
                provider: { in: ["RAZORPAY", "CASHFREE"] },
            },
            {
                organization: { edition: "GLOBAL" },
                provider: { in: ["STRIPE"] },
            },
        ]);
        expect(OPENS_CHECKOUT.AND).toContain(IN_EDITION);
    });
});

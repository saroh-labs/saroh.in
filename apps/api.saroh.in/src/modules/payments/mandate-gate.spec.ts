import type { Prisma } from "@saroh/database";

import {
    autopayRefusal,
    cancelAutopayFirst,
    openMandatesWhere,
    providerName,
} from "./mandate-gate";
import type { MandatesService } from "./mandates.service";

/**
 * Autopay ends at the provider before a person's record does (D20, C11):
 * the gate a privacy removal and a hard delete ask first.
 */

type Db = Parameters<typeof cancelAutopayFirst>[0];

function db(open: { provider: string } | null): {
    db: Db;
    findFirst: jest.Mock;
} {
    const findFirst = jest.fn().mockResolvedValue(open);
    return {
        db: { paymentMandate: { findFirst } } as unknown as Db,
        findFirst,
    };
}

function mandates(unconfirmed: number, cancelled = 1) {
    const cancelFor = jest
        .fn()
        .mockResolvedValue({ cancelled, awaitingProvider: 1, unconfirmed });
    return {
        service: { cancelFor } as unknown as Pick<MandatesService, "cancelFor">,
        cancelFor,
    };
}

const scope = { organizationId: "org_1", contactId: "c_1" };

describe("cancelAutopayFirst", () => {
    it("goes ahead with nothing open, and asks no provider", async () => {
        const { db: d } = db(null);
        const { service, cancelFor } = mandates(0);
        await expect(
            cancelAutopayFirst(d, service, scope, "PRIVACY_REMOVAL"),
        ).resolves.toEqual({ ok: true, cancelled: 0 });
        expect(cancelFor).not.toHaveBeenCalled();
    });

    it("cancels through D20's cancelFor with the reason, and goes ahead once confirmed", async () => {
        const { db: d } = db({ provider: "razorpay" });
        const { service, cancelFor } = mandates(0, 2);
        await expect(
            cancelAutopayFirst(d, service, scope, "PRIVACY_REMOVAL"),
        ).resolves.toEqual({ ok: true, cancelled: 2 });
        expect(cancelFor).toHaveBeenCalledWith(scope, "PRIVACY_REMOVAL");
    });

    it("stops while the provider hasn't confirmed (DEC-026)", async () => {
        const { db: d } = db({ provider: "razorpay" });
        const { service } = mandates(1);
        await expect(
            cancelAutopayFirst(d, service, scope, "STAFF"),
        ).resolves.toEqual({ ok: false, provider: "razorpay" });
    });

    it("stops without the service rather than lose a mandate", async () => {
        const { db: d } = db({ provider: "cashfree" });
        await expect(
            cancelAutopayFirst(d, undefined, scope, "STAFF"),
        ).resolves.toEqual({ ok: false, provider: "cashfree" });
    });

    it("counts a cancelled mandate the provider hasn't confirmed as open", () => {
        const where = openMandatesWhere("org_1", "c_1");
        expect(where).toEqual<Prisma.PaymentMandateWhereInput>({
            organizationId: "org_1",
            contactId: "c_1",
            OR: [
                { status: { in: ["PENDING", "ACTIVE", "PAUSED"] } },
                { status: "CANCELLED", cancelConfirmedAt: null },
            ],
        });
    });
});

describe("the refusal's words", () => {
    it("names the provider as a merchant knows it", () => {
        expect(providerName("razorpay")).toBe("Razorpay");
        expect(providerName("Cashfree")).toBe("Cashfree");
        expect(providerName("mystery")).toBe("your payment provider");
        expect(providerName(null)).toBe("your payment provider");
    });

    it("says nothing changed and that a retry is safe", () => {
        expect(autopayRefusal("razorpay", "removed")).toBe(
            "Their autopay couldn't be cancelled at Razorpay yet, so nothing was removed. Try again in a few minutes",
        );
        expect(autopayRefusal(null, "deleted")).toContain(
            "nothing was deleted",
        );
    });
});

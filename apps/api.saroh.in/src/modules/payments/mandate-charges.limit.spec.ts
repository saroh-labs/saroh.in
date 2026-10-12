// Autopay never takes more than the customer authorised (12 Oct 2026).
//
// A plan's renewal now carries its GST: where the business adds GST to its
// prices, a ₹2,000 plan at 18% renews at ₹2,360. A mandate set up for less
// than that must never be charged: the renewal goes out as an invoice with
// a pay link, the path the code already takes when autopay can't charge
// (MANDATE_LIMIT_LOW). The limit is asked three times before a debit —
// when the charge is queued, when it is prepared, and when it is asked for
// — and each is pinned here with the database and the provider mocked.
jest.mock("@saroh/database", () => {
    const actual = jest.requireActual("@saroh/database");
    const client = {
        paymentMandate: { findFirst: jest.fn() },
        invoice: { findFirst: jest.fn() },
        paymentIntent: {
            findFirst: jest.fn(),
            count: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            updateMany: jest.fn(),
        },
    };
    return { ...actual, prisma: client };
});
jest.mock("./mandate-charge-gate", () => ({
    mandateChargingOn: jest.fn().mockResolvedValue(true),
}));
jest.mock("./charge-under-way", () => ({
    ...jest.requireActual<typeof import("./charge-under-way")>(
        "./charge-under-way",
    ),
    checkoutOpenOn: jest.fn().mockResolvedValue(false),
}));
jest.mock("./mandate-charge-outcome", () => ({
    ...jest.requireActual<typeof import("./mandate-charge-outcome")>(
        "./mandate-charge-outcome",
    ),
    recordChargeEventInTx: jest.fn().mockResolvedValue(true),
}));
jest.mock("../subscriptions/charge-job", () => ({
    ...jest.requireActual<typeof import("../subscriptions/charge-job")>(
        "../subscriptions/charge-job",
    ),
    enqueueChargeStepInTx: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("./mandate-connection", () => ({
    openMandateConnection: jest.fn(),
}));

import "reflect-metadata";

import type { Prisma } from "@saroh/database";
import { prisma } from "@saroh/database";

import { enqueueChargeStepInTx } from "../subscriptions/charge-job";
import { recordChargeEventInTx } from "./mandate-charge-outcome";
import { MandateChargesService } from "./mandate-charges.service";
import { openMandateConnection } from "./mandate-connection";
import { mandateLimitCents } from "./mandate-rules";
import type { ProviderFactory } from "./providers/provider.port";

type Mocked = Record<string, Record<string, jest.Mock>>;
const db = prisma as unknown as Mocked;
const tx = prisma as unknown as Prisma.TransactionClient;

const decimal = (s: string) => ({ toString: () => s });

/** The provider's mandate calls: none of them may run above the limit. */
const provider = {
    prepareCharge: jest.fn(),
    charge: jest.fn(),
    getPreDebit: jest.fn(),
};
const charges = new MandateChargesService({
    get: () => ({ mandates: provider }),
} as unknown as ProviderFactory);

/** An ACTIVE mandate whose limit is ₹2,000. */
const mandate = (maxAmountCents: number | null = 200_000) => ({
    id: "man_1",
    organizationId: "org_1",
    subscriptionId: "sub_1",
    provider: "RAZORPAY",
    providerMandateId: "token_1",
    providerCustomerId: "cust_1",
    status: "ACTIVE",
    method: "UPI",
    currency: "INR",
    maxAmountCents,
});

/** A renewal invoice: ₹2,000 at 18% with GST added is ₹2,360 to pay. */
const renewal = (total = "2360.00") => ({
    id: "inv_1",
    status: "ISSUED",
    total: decimal(total),
    currency: "INR",
    subscriptionId: "sub_1",
});

const queue = () =>
    charges.queueInTx(tx, {
        organizationId: "org_1",
        subscriptionId: "sub_1",
        invoiceId: "inv_1",
        now: new Date("2026-11-01T00:00:00Z"),
    });

beforeEach(() => {
    jest.clearAllMocks();
    db.paymentMandate!.findFirst!.mockResolvedValue(mandate());
    db.invoice!.findFirst!.mockResolvedValue(renewal());
    db.paymentIntent!.findFirst!.mockResolvedValue(null);
    db.paymentIntent!.count!.mockResolvedValue(0);
    db.paymentIntent!.create!.mockResolvedValue({ id: "pi_1" });
    (openMandateConnection as jest.Mock).mockResolvedValue({
        mandates: provider,
        credentials: {},
    });
});

describe("a renewal above the mandate's limit", () => {
    it("is never queued: no charge is written, no step is enqueued, and the limit is recorded", async () => {
        await expect(queue()).resolves.toEqual({ status: "LIMIT_LOW" });
        // Nothing that could become a debit.
        expect(db.paymentIntent!.create).not.toHaveBeenCalled();
        expect(enqueueChargeStepInTx).not.toHaveBeenCalled();
        expect(provider.prepareCharge).not.toHaveBeenCalled();
        expect(provider.charge).not.toHaveBeenCalled();
        // The business is told why, with both sums: the invoice stands, and
        // its pay link is the way it is paid.
        expect(recordChargeEventInTx).toHaveBeenCalledWith(
            tx,
            "org_1",
            "inv_1",
            "MANDATE_LIMIT_LOW",
            { limit: "2000.00", amount: "2360.00", currency: "INR" },
        );
    });

    it("is not queued by a paisa over, and is at the limit exactly", async () => {
        db.invoice!.findFirst!.mockResolvedValue(renewal("2000.01"));
        await expect(queue()).resolves.toEqual({ status: "LIMIT_LOW" });
        expect(db.paymentIntent!.create).not.toHaveBeenCalled();

        db.invoice!.findFirst!.mockResolvedValue(renewal("2000.00"));
        await expect(queue()).resolves.toMatchObject({ status: "QUEUED" });
        expect(db.paymentIntent!.create).toHaveBeenCalledTimes(1);
    });

    it("is never queued on a mandate with no limit on file", async () => {
        db.paymentMandate!.findFirst!.mockResolvedValue(mandate(null));
        await expect(queue()).resolves.toEqual({ status: "LIMIT_LOW" });
        expect(db.paymentIntent!.create).not.toHaveBeenCalled();
    });

    it("is refused when prepared, before the provider is asked for anything", async () => {
        await expect(
            charges.prepareCharge({
                organizationId: "org_1",
                mandateId: "man_1",
                invoiceId: "inv_1",
                key: "inv_inv_1_1",
                now: new Date("2026-11-01T00:00:00Z"),
            } as never),
        ).resolves.toEqual({ status: "REFUSED", reason: "ABOVE_LIMIT" });
        expect(db.paymentIntent!.create).not.toHaveBeenCalled();
        expect(provider.prepareCharge).not.toHaveBeenCalled();
    });

    it("is refused at the debit too: a charge queued under an older limit is let go, never taken", async () => {
        // The charge was written for ₹2,360; the mandate now allows ₹2,000.
        db.paymentIntent!.findFirst!.mockResolvedValue({
            id: "pi_1",
            status: "REQUIRES_PAYMENT",
            providerIntentId: "order_1",
            amountCents: 236_000,
            debitAfter: new Date("2026-10-31T00:00:00Z"),
            preDebitStatus: "DELIVERED",
            viaMandate: mandate(),
            invoice: { status: "ISSUED", subscriptionId: "sub_1" },
        });
        await expect(
            charges.charge({
                organizationId: "org_1",
                intentId: "pi_1",
                now: new Date("2026-11-01T00:00:00Z"),
            }),
        ).resolves.toEqual({
            status: "REFUSED",
            reason: "ABOVE_LIMIT",
            intentId: "pi_1",
        });
        expect(provider.charge).not.toHaveBeenCalled();
        // The charge is closed, so the pay link opens.
        expect(db.paymentIntent!.updateMany).toHaveBeenCalledWith({
            where: { id: "pi_1", status: "REQUIRES_PAYMENT" },
            data: { status: "CANCELLED" },
        });
    });
});

describe("a renewal within the mandate's limit", () => {
    it("is queued for the invoice's amount to pay, GST and all, and never more", async () => {
        db.paymentMandate!.findFirst!.mockResolvedValue(mandate(300_000));
        await expect(queue()).resolves.toEqual({
            status: "QUEUED",
            intentId: "pi_1",
            key: "inv_inv_1_1",
        });
        expect(db.paymentIntent!.create.mock.calls[0][0].data).toMatchObject({
            invoiceId: "inv_1",
            amountCents: 236_000,
            currency: "INR",
            viaMandateId: "man_1",
            status: "CREATED",
        });
        expect(recordChargeEventInTx).not.toHaveBeenCalled();
    });
});

describe("the limit a new mandate takes", () => {
    it("covers a renewal with GST added: ₹2,000 at 18% is ₹2,360, inside a ₹3,600 limit", () => {
        // Set up from the renewal's amount to pay (`autopay.service.ts`).
        expect(mandateLimitCents(236_000)).toBe(360_000);
        expect(mandateLimitCents(236_000)).toBeGreaterThanOrEqual(236_000);
    });

    it("a limit taken from the typed price before GST was added still covers 18%, and no rate GST has takes it past", () => {
        // An older mandate: 1.5 times ₹2,000, rounded up to ₹100.
        const limit = mandateLimitCents(200_000);
        expect(limit).toBe(300_000);
        // 40% is the highest rate GST has: ₹2,800 to pay.
        expect(200_000 + (200_000 * 4000) / 10_000).toBeLessThanOrEqual(limit);
    });
});

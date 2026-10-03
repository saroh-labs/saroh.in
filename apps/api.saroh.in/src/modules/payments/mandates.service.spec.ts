// A mandate ends with its subscription, a removal or a merge (round-2 D20):
// how the service reads the provider's answer to a cancel, with a mocked
// Prisma and the fake provider. The real rows are in mandates.db.spec.ts.
jest.mock("@saroh/database", () => {
    const tx = {
        paymentMandate: { findMany: jest.fn(), updateMany: jest.fn() },
        // A cancelled mandate's open charges close with it.
        paymentIntent: {
            updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        },
        subscriptionEvent: { create: jest.fn() },
        job: { create: jest.fn() },
    };
    return {
        prisma: {
            paymentMandate: { findMany: jest.fn(), updateMany: jest.fn() },
            merchantPaymentProvider: { findUnique: jest.fn() },
            $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
            __tx: tx,
        },
    };
});
jest.mock("./provider-credentials", () => ({
    openProviderCredentials: () => ({ keyId: "key", keySecret: "secret" }),
}));

import { prisma } from "@saroh/database";

import { MANDATE_CANCEL_TYPE } from "./mandate-cancel-job";
import { MandatesService } from "./mandates.service";
import {
    FakeMerchantProvider,
    FakeProviderFactory,
} from "./providers/fake.provider";
import type {
    MerchantProvider,
    ProviderFactory,
} from "./providers/provider.port";
import { supportsMandates } from "./providers/provider.port";

type Mocked = Record<string, jest.Mock>;
const db = prisma as unknown as Record<string, Mocked> & {
    __tx: Record<string, Mocked>;
};
const tx = db.__tx;

const scope = { organizationId: "org_1", subscriptionId: "sub_1" };

function row(over: Record<string, unknown> = {}) {
    return {
        id: "man_1",
        provider: "RAZORPAY",
        providerMandateId: "rzp_token_1",
        providerCustomerId: "cust_1",
        ...over,
    };
}

let fake: FakeMerchantProvider;
let service: MandatesService;

beforeEach(() => {
    jest.clearAllMocks();
    fake = new FakeMerchantProvider();
    service = new MandatesService(new FakeProviderFactory(fake));
    db.merchantPaymentProvider!.findUnique!.mockResolvedValue({
        id: "prov_1",
        provider: "RAZORPAY",
    });
    db.paymentMandate!.findMany!.mockResolvedValue([row()]);
    db.paymentMandate!.updateMany!.mockResolvedValue({ count: 1 });
    tx.paymentMandate!.findMany!.mockResolvedValue([]);
    tx.paymentMandate!.updateMany!.mockResolvedValue({ count: 1 });
});

describe("asking the provider to cancel (settle)", () => {
    it("reads only the scope's cancelled mandates the provider hasn't confirmed", async () => {
        await service.settle(scope);
        expect(db.paymentMandate!.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    organizationId: "org_1",
                    subscriptionId: "sub_1",
                    status: "CANCELLED",
                    cancelConfirmedAt: null,
                },
            }),
        );
    });

    it("records the provider's yes", async () => {
        await expect(service.settle(scope)).resolves.toEqual({
            confirmed: 1,
            unsure: 0,
            refused: 0,
        });
        expect(fake.mandateCancelCalls).toEqual([
            {
                providerMandateId: "rzp_token_1",
                providerCustomerId: "cust_1",
                credentials: { keyId: "key", keySecret: "secret" },
            },
        ]);
        expect(db.paymentMandate!.updateMany).toHaveBeenCalledWith({
            where: { id: "man_1", cancelConfirmedAt: null },
            data: { cancelConfirmedAt: expect.any(Date) },
        });
    });

    it("leaves a timeout unconfirmed, to ask again", async () => {
        fake.failNextMandateCancel("UNKNOWN");
        await expect(service.settle(scope)).resolves.toEqual({
            confirmed: 0,
            unsure: 1,
            refused: 0,
        });
        expect(db.paymentMandate!.updateMany).not.toHaveBeenCalled();
    });

    it("reads an error that isn't the port's as unsure, never as a no", async () => {
        const provider: MerchantProvider = {
            ...fake,
            name: "RAZORPAY",
            createOrderIntent: jest.fn(),
            refund: jest.fn(),
            findRefund: jest.fn(),
            mandates: {
                cancel: () => Promise.reject(new Error("socket hang up")),
            },
        };
        const factory: ProviderFactory = { get: () => provider };
        const result = await new MandatesService(factory).settle(scope);
        expect(result).toEqual({ confirmed: 0, unsure: 1, refused: 0 });
    });

    it("counts a refusal apart, and leaves it unconfirmed", async () => {
        fake.failNextMandateCancel("REFUSED");
        await expect(service.settle(scope)).resolves.toEqual({
            confirmed: 0,
            unsure: 0,
            refused: 1,
        });
        expect(db.paymentMandate!.updateMany).not.toHaveBeenCalled();
    });

    it("confirms a mandate that never reached the provider without a call", async () => {
        db.paymentMandate!.findMany!.mockResolvedValue([
            row({ providerMandateId: null }),
        ]);
        await expect(service.settle(scope)).resolves.toMatchObject({
            confirmed: 1,
        });
        expect(fake.mandateCancelCalls).toEqual([]);
    });

    it("can't ask without the business's connection", async () => {
        db.merchantPaymentProvider!.findUnique!.mockResolvedValue(null);
        await expect(service.settle(scope)).resolves.toMatchObject({
            refused: 1,
        });
        expect(fake.mandateCancelCalls).toEqual([]);
    });

    it("can't ask a provider whose adapter has no mandates", async () => {
        const plain: MerchantProvider = {
            name: "CASHFREE",
            createOrderIntent: jest.fn(),
            refund: jest.fn(),
            findRefund: jest.fn(),
        };
        expect(supportsMandates(plain)).toBe(false);
        expect(supportsMandates(fake)).toBe(true);
        const result = await new MandatesService({
            get: () => plain,
        }).settle(scope);
        expect(result).toEqual({ confirmed: 0, unsure: 0, refused: 1 });
    });

    it("opens the connection once for several mandates", async () => {
        db.paymentMandate!.findMany!.mockResolvedValue([
            row(),
            row({ id: "man_2", providerMandateId: "rzp_token_2" }),
        ]);
        await expect(service.settle(scope)).resolves.toMatchObject({
            confirmed: 2,
        });
        expect(db.merchantPaymentProvider!.findUnique).toHaveBeenCalledTimes(1);
    });

    it("asks nothing when every mandate in scope is confirmed", async () => {
        db.paymentMandate!.findMany!.mockResolvedValue([]);
        await expect(service.settle(scope)).resolves.toEqual({
            confirmed: 0,
            unsure: 0,
            refused: 0,
        });
        expect(fake.mandateCancelCalls).toEqual([]);
    });
});

describe("cancelling now (cancelFor, for a privacy removal)", () => {
    const contact = { organizationId: "org_1", contactId: "c_1" };

    beforeEach(() => {
        tx.paymentMandate!.findMany!.mockResolvedValue([
            { id: "man_1", subscriptionId: "sub_1", providerMandateId: "p_1" },
        ]);
    });

    it("marks the contact's live mandates cancelled and waits for the provider", async () => {
        const result = await service.cancelFor(contact, "PRIVACY_REMOVAL");
        expect(result).toEqual({
            cancelled: 1,
            awaitingProvider: 1,
            unconfirmed: 0,
            refused: 0,
        });
        expect(tx.paymentMandate!.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({ contactId: "c_1" }),
            }),
        );
        expect(tx.paymentMandate!.updateMany).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    cancelReason: "PRIVACY_REMOVAL",
                }),
            }),
        );
        // It heard the answer itself: no job to ask again.
        expect(tx.job!.create).not.toHaveBeenCalled();
    });

    it("says what is unconfirmed, and leaves a job asking, on a timeout", async () => {
        fake.failNextMandateCancel("UNKNOWN");
        const result = await service.cancelFor(contact, "PRIVACY_REMOVAL");
        expect(result.unconfirmed).toBe(1);
        expect(tx.job!.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                type: MANDATE_CANCEL_TYPE,
                payload: { contactId: "c_1" },
            }),
        });
    });

    it("says a refusal is unconfirmed, without a job that would be refused again", async () => {
        fake.failNextMandateCancel("REFUSED");
        const result = await service.cancelFor(contact, "PRIVACY_REMOVAL");
        expect(result.unconfirmed).toBe(1);
        expect(tx.job!.create).not.toHaveBeenCalled();
    });
});

describe("the fake provider's cancel", () => {
    const input = {
        providerMandateId: "p_1",
        providerCustomerId: null,
        credentials: { keyId: "k", keySecret: "s" },
    };

    it("answers a second cancel of one mandate as done", async () => {
        await fake.mandates.cancel(input);
        await expect(fake.mandates.cancel(input)).resolves.toBeUndefined();
        expect(fake.cancelledMandates.has("p_1")).toBe(true);
    });

    it("can cancel while losing the answer", async () => {
        fake.failNextMandateCancel("UNKNOWN", { madeAnyway: true });
        await expect(fake.mandates.cancel(input)).rejects.toMatchObject({
            outcome: "UNKNOWN",
        });
        expect(fake.cancelledMandates.has("p_1")).toBe(true);
        await expect(fake.mandates.cancel(input)).resolves.toBeUndefined();
    });
});

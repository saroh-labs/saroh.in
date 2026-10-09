jest.mock("@saroh/database", () => {
    const prisma = {
        organization: { findUnique: jest.fn() },
        subscription: {
            findUnique: jest.fn(),
            update: jest.fn(),
            updateMany: jest.fn(),
        },
        subscriptionAddon: { deleteMany: jest.fn() },
        subscriptionAddonCharge: { updateMany: jest.fn() },
        billingCheckout: {
            findMany: jest.fn(),
            findUnique: jest.fn(),
            update: jest.fn(),
        },
        job: { create: jest.fn() },
        $queryRaw: jest.fn(),
        $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
    };
    return { prisma };
});

import { ForbiddenException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import { AddonsSyncHandler } from "./addon-charges";
import {
    assertBillingMayStart,
    billingMayChargeFor,
    DeletedBusinessBilling,
    stopRenewalsInTx,
} from "./business-closing";
import { BILLING_PROVIDER_CANCEL_TYPE } from "./provider-cancel.job";
import type { BillingProviderFactory } from "./providers/billing-provider.port";
import { BillingProviderError } from "./providers/billing-provider.port";

const readOrg = prisma.organization.findUnique as jest.Mock;
const readSub = prisma.subscription.findUnique as jest.Mock;
const writeSub = prisma.subscription.update as jest.Mock;
const liveCheckouts = prisma.billingCheckout.findMany as jest.Mock;
const checkoutOf = prisma.billingCheckout.findUnique as jest.Mock;
const jobCreate = prisma.job.create as jest.Mock;
const tx = prisma as never;

const paidSub = (extra: Record<string, unknown> = {}) => ({
    id: "sub_1",
    status: "ACTIVE",
    provider: "RAZORPAY",
    providerSubscriptionId: "rzp_sub_1",
    cancelAtPeriodEnd: false,
    ...extra,
});

beforeEach(() => {
    jest.clearAllMocks();
    liveCheckouts.mockResolvedValue([]);
    checkoutOf.mockResolvedValue({ providerPlanId: "plan_x" });
});

describe("billing for a closing or deleted business (#921)", () => {
    it.each([
        ["ACTIVE", true],
        ["SUSPENDED", true],
        ["PENDING_DELETION", false],
        ["DELETED_RETAINED", false],
    ])("%s may be charged: %s", async (lifecycleStatus, may) => {
        readOrg.mockResolvedValue({ lifecycleStatus });
        await expect(billingMayChargeFor(tx, "org_1")).resolves.toBe(may);
        const start = assertBillingMayStart(tx, "org_1");
        if (may) await expect(start).resolves.toBeUndefined();
        else await expect(start).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("leaves a missing business to the caller's own 404", async () => {
        readOrg.mockResolvedValue(null);
        await expect(assertBillingMayStart(tx, "org_1")).resolves.toBe(
            undefined,
        );
        await expect(billingMayChargeFor(tx, "org_1")).resolves.toBe(false);
    });
});

describe("stopRenewalsInTx: deletion scheduled (#921)", () => {
    it("ends the provider subscription with the period paid", async () => {
        readSub.mockResolvedValue(paidSub());
        const result = await stopRenewalsInTx(tx, "org_1");
        expect(result).toEqual({ providerCancels: 1, checkoutsDropped: 0 });
        expect(writeSub).toHaveBeenCalledWith({
            where: { id: "sub_1" },
            data: { cancelAtPeriodEnd: true },
        });
        expect(jobCreate).toHaveBeenCalledWith({
            data: {
                type: BILLING_PROVIDER_CANCEL_TYPE,
                organizationId: "org_1",
                payload: {
                    provider: "RAZORPAY",
                    providerSubscriptionId: "rzp_sub_1",
                    atCycleEnd: true,
                },
            },
        });
    });

    it("ends a trial at once: it paid nothing ahead", async () => {
        readSub.mockResolvedValue(paidSub({ status: "TRIALING" }));
        await stopRenewalsInTx(tx, "org_1");
        expect(jobCreate.mock.calls[0][0].data.payload.atCycleEnd).toBe(false);
    });

    it("gives up the checkouts waiting", async () => {
        readSub.mockResolvedValue(null);
        liveCheckouts.mockResolvedValue([
            {
                id: "co_1",
                status: "OPEN",
                provider: "RAZORPAY",
                providerSubscriptionId: "rzp_sub_new",
                planId: "p",
            },
        ]);
        const result = await stopRenewalsInTx(tx, "org_1");
        expect(result).toEqual({ providerCancels: 0, checkoutsDropped: 1 });
        expect(prisma.billingCheckout.update).toHaveBeenCalledWith({
            where: { id: "co_1" },
            data: { status: "CANCELLED", endedReason: "business-closing" },
        });
    });

    it.each([
        ["no subscription", null],
        [
            "a free plan",
            paidSub({ provider: null, providerSubscriptionId: null }),
        ],
        ["one already set to end", paidSub({ cancelAtPeriodEnd: true })],
        ["one cancelled", paidSub({ status: "CANCELLED" })],
    ])("leaves %s alone", async (_label, sub) => {
        readSub.mockResolvedValue(sub);
        const result = await stopRenewalsInTx(tx, "org_1");
        expect(result.providerCancels).toBe(0);
        expect(writeSub).not.toHaveBeenCalled();
        expect(jobCreate).not.toHaveBeenCalled();
    });

    it("leaves a year paid once alone: nothing renews it", async () => {
        readSub.mockResolvedValue(paidSub());
        checkoutOf.mockResolvedValue({ providerPlanId: "one-time" });
        const result = await stopRenewalsInTx(tx, "org_1");
        expect(result.providerCancels).toBe(0);
    });
});

describe("the add-ons sync sends nothing for a closing business (#921)", () => {
    it.each(["PENDING_DELETION", "DELETED_RETAINED"])(
        "%s: no charge is put on the provider's next charge",
        async (lifecycleStatus) => {
            readSub.mockResolvedValue({
                provider: "RAZORPAY",
                providerSubscriptionId: "rzp_sub_1",
                organization: { lifecycleStatus },
            });
            const addToNextCharge = jest.fn();
            const sync = new AddonsSyncHandler({
                get: () => ({ charges: { addToNextCharge } }),
            } as unknown as BillingProviderFactory);
            await sync.handle({
                id: "job_1",
                payload: { subscriptionId: "sub_1" },
            } as never);
            expect(addToNextCharge).not.toHaveBeenCalled();
        },
    );
});

describe("DeletedBusinessBilling.end: the window ended (#921)", () => {
    const cancelSubscription = jest.fn();
    const providers = {
        get: jest.fn(() => ({ cancelSubscription })),
    } as unknown as BillingProviderFactory;
    const billing = new DeletedBusinessBilling(providers);

    beforeEach(() => {
        cancelSubscription.mockReset();
        readOrg.mockResolvedValue({ lifecycleStatus: "DELETED_RETAINED" });
    });

    it("cancels at the provider now, then records it CANCELLED", async () => {
        readSub.mockResolvedValue(paidSub());
        const result = await billing.end("org_1");
        expect(cancelSubscription).toHaveBeenCalledWith("rzp_sub_1", {
            atCycleEnd: false,
        });
        expect(writeSub).toHaveBeenCalledWith({
            where: { id: "sub_1" },
            data: {
                status: "CANCELLED",
                cancelAtPeriodEnd: true,
                pendingPlanId: null,
                pendingFrom: null,
            },
        });
        expect(result).toEqual({
            cancelledAtProvider: true,
            subscriptionCancelled: true,
            checkoutsDropped: 0,
        });
    });

    it("writes nothing when the provider doesn't answer, so the job retries", async () => {
        readSub.mockResolvedValue(paidSub());
        cancelSubscription.mockRejectedValue(
            new BillingProviderError("UNKNOWN", "timeout"),
        );
        await expect(billing.end("org_1")).rejects.toThrow();
        expect(writeSub).not.toHaveBeenCalled();
    });

    it("takes a refusal (already cancelled) as the provider's settled answer", async () => {
        readSub.mockResolvedValue(paidSub());
        cancelSubscription.mockRejectedValue(
            new BillingProviderError("REFUSED", "already cancelled"),
        );
        const result = await billing.end("org_1");
        expect(result.cancelledAtProvider).toBe(false);
        expect(result.subscriptionCancelled).toBe(true);
    });

    it("is idempotent: a cancelled subscription is left as it is", async () => {
        readSub.mockResolvedValue(paidSub({ status: "CANCELLED" }));
        const result = await billing.end("org_1");
        expect(cancelSubscription).not.toHaveBeenCalled();
        expect(writeSub).not.toHaveBeenCalled();
        expect(result.subscriptionCancelled).toBe(false);
    });

    it("records nothing for a business that isn't deleted", async () => {
        readSub.mockResolvedValue(paidSub());
        readOrg.mockResolvedValue({ lifecycleStatus: "PENDING_DELETION" });
        const result = await billing.end("org_1");
        expect(writeSub).not.toHaveBeenCalled();
        expect(result.subscriptionCancelled).toBe(false);
    });
});

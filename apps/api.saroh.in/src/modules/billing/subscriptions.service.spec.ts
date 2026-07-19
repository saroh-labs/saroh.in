// DB-free unit tests for the plans/subscriptions surface (S7-005). Only the
// BILLING delegates (plan/subscription) are mocked; the MERCHANT payment
// delegates are mocked too and asserted NEVER-CALLED during subscribe/cancel —
// the credential-separation boundary. The billing provider is a
// FakeBillingProvider (no network, no process.env).
jest.mock("@saroh/database", () => {
    const plan = { findFirst: jest.fn(), findMany: jest.fn() };
    const subscription = {
        findUnique: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
    };
    // Merchant delegates — present ONLY so we can assert billing never uses them.
    const merchantPaymentProvider = {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
    };
    const paymentIntent = { findFirst: jest.fn(), create: jest.fn() };
    const paymentAttempt = { create: jest.fn() };
    const paymentRefund = { create: jest.fn(), findFirst: jest.fn() };
    const webhookEvent = { create: jest.fn() };
    return {
        prisma: {
            plan,
            subscription,
            merchantPaymentProvider,
            paymentIntent,
            paymentAttempt,
            paymentRefund,
            webhookEvent,
        },
    };
});

import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { PlansService } from "./plans.service";
import {
    FakeBillingProvider,
    FakeBillingProviderFactory,
} from "./providers/fake.provider";
import { SubscriptionsService } from "./subscriptions.service";

const planFindFirst = prisma.plan.findFirst as jest.Mock;
const subFindUnique = prisma.subscription.findUnique as jest.Mock;
const subUpsert = prisma.subscription.upsert as jest.Mock;

/** Every mocked merchant delegate — asserted never-called after each flow. */
function merchantDelegates(): jest.Mock[] {
    const p = prisma as unknown as Record<string, Record<string, jest.Mock>>;
    return [
        p.merchantPaymentProvider.findUnique,
        p.merchantPaymentProvider.create,
        p.merchantPaymentProvider.update,
        p.paymentIntent.findFirst,
        p.paymentIntent.create,
        p.paymentAttempt.create,
        p.paymentRefund.create,
        p.paymentRefund.findFirst,
        p.webhookEvent.create,
    ];
}

function expectNoMerchantAccess(): void {
    for (const delegate of merchantDelegates()) {
        expect(delegate).not.toHaveBeenCalled();
    }
}

function ctx(over: Partial<OrganizationContext> = {}): OrganizationContext {
    return {
        organizationId: "org_1",
        userId: "user_1",
        role: "ADMIN",
        ...over,
    };
}

function makeService(fake = new FakeBillingProvider("RAZORPAY")) {
    const service = new SubscriptionsService(
        new PlansService(),
        new FakeBillingProviderFactory(fake),
    );
    return { service, fake };
}

const FREE_PLAN = {
    id: "plan_free",
    key: "free",
    version: 1,
    priceCents: 0,
    currency: "INR",
    interval: "month",
};
const PRO_PLAN = {
    id: "plan_pro",
    key: "pro",
    version: 2,
    priceCents: 49900,
    currency: "INR",
    interval: "month",
};

beforeEach(() => jest.clearAllMocks());

describe("SubscriptionsService authz", () => {
    it("denies a MEMBER subscribing (billing:manage) before any I/O", async () => {
        const { service } = makeService();

        await expect(
            service.subscribe(ctx({ role: "MEMBER" }), { planKey: "pro" }),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(planFindFirst).not.toHaveBeenCalled();
    });

    it("denies a MEMBER reading the subscription (billing:read)", async () => {
        const { service } = makeService();

        await expect(
            service.getCurrent(ctx({ role: "MEMBER" })),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(subFindUnique).not.toHaveBeenCalled();
    });
});

describe("SubscriptionsService.subscribe (free plan)", () => {
    it("upserts a provider-less ACTIVE subscription and calls NO provider", async () => {
        const { service, fake } = makeService();
        planFindFirst.mockResolvedValue(FREE_PLAN);
        subUpsert.mockResolvedValue({ id: "sub_1", plan: FREE_PLAN });

        await service.subscribe(ctx(), { planKey: "free" });

        // One-sub-per-org: upsert keyed on organizationId.
        expect(subUpsert).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { organizationId: "org_1" },
                create: expect.objectContaining({
                    planId: "plan_free",
                    status: "ACTIVE",
                }),
                update: expect.objectContaining({ provider: null }),
            }),
        );
        // A free plan never reaches a billing provider.
        expect(fake.createCalls).toHaveLength(0);
        expectNoMerchantAccess();
    });
});

describe("SubscriptionsService.subscribe (paid plan)", () => {
    it("creates the provider subscription and stores its ids (one upsert per org)", async () => {
        const { service, fake } = makeService();
        planFindFirst.mockResolvedValue(PRO_PLAN);
        subUpsert.mockResolvedValue({ id: "sub_1", plan: PRO_PLAN });

        await service.subscribe(ctx(), {
            planKey: "pro",
            provider: "RAZORPAY",
        });

        // The billing provider was asked to create the subscription with the
        // resolved plan terms — never a merchant credential.
        expect(fake.createCalls).toHaveLength(1);
        expect(fake.createCalls[0]).toEqual(
            expect.objectContaining({
                planKey: "pro",
                planId: "plan_pro",
                priceCents: 49900,
                organizationId: "org_1",
            }),
        );
        // The provider ids are persisted on the single per-org row.
        expect(subUpsert).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { organizationId: "org_1" },
                create: expect.objectContaining({
                    provider: "RAZORPAY",
                    providerSubscriptionId: "fake_sub_org_1",
                    status: "ACTIVE",
                }),
            }),
        );
        expectNoMerchantAccess();
    });

    it("400s a paid plan with no billing provider (and calls no provider)", async () => {
        const { service, fake } = makeService();
        planFindFirst.mockResolvedValue(PRO_PLAN);

        await expect(
            service.subscribe(ctx(), { planKey: "pro" }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(fake.createCalls).toHaveLength(0);
        expect(subUpsert).not.toHaveBeenCalled();
    });
});

describe("SubscriptionsService.cancel", () => {
    it("400s when the org has no subscription", async () => {
        const { service } = makeService();
        subFindUnique.mockResolvedValue(null);

        await expect(service.cancel(ctx(), {})).rejects.toBeInstanceOf(
            BadRequestException,
        );
    });

    it("cancels the provider sub and flips cancelAtPeriodEnd", async () => {
        const { service, fake } = makeService();
        subFindUnique.mockResolvedValue({
            id: "sub_1",
            organizationId: "org_1",
            provider: "RAZORPAY",
            providerSubscriptionId: "fake_sub_org_1",
        });
        (prisma.subscription.update as jest.Mock).mockResolvedValue({
            id: "sub_1",
            plan: PRO_PLAN,
        });

        await service.cancel(ctx(), {});

        expect(fake.cancelCalls).toEqual(["fake_sub_org_1"]);
        expect(prisma.subscription.update).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { organizationId: "org_1" },
                data: expect.objectContaining({ cancelAtPeriodEnd: true }),
            }),
        );
        expectNoMerchantAccess();
    });
});

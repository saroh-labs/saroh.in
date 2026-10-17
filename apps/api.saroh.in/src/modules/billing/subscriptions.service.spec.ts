// DB-free unit tests for the subscription read (S7-005) and the retired
// writes (`POST …/billing/subscribe` and `…/cancel`, 410 since 17 Oct 2026):
// the owner check first, then Gone, touching nothing — no plan, no
// subscription, no merchant payment delegate.
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
            // An active business may be charged (#921).
            organization: {
                findUnique: jest.fn().mockResolvedValue({
                    lifecycleStatus: "ACTIVE",
                    name: "Billing Test",
                }),
            },
            // Who Saroh bills is whole (17 Oct 2026): a name, an email, a
            // registered address and its state.
            businessProfile: {
                findUnique: jest.fn().mockResolvedValue({
                    legalName: null,
                    contactEmail: null,
                    phone: null,
                    taxId: null,
                    gstState: "29",
                    addressLine1: "3 Hill Road",
                    addressLine2: null,
                    city: "Bengaluru",
                    postalCode: "560038",
                }),
            },
            user: {
                findUnique: jest.fn().mockResolvedValue({
                    email: "owner@example.com",
                    name: null,
                }),
            },
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

import { ForbiddenException, GoneException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import type { OrganizationContext } from "../../common/types/organization-context";
import { roleDenial } from "../organizations/organization-policy";
import { SubscriptionsService } from "./subscriptions.service";

const planFindFirst = prisma.plan.findFirst as jest.Mock;
const subFindUnique = prisma.subscription.findUnique as jest.Mock;
const subUpsert = prisma.subscription.upsert as jest.Mock;
const subUpdate = prisma.subscription.update as jest.Mock;

/** Every mocked merchant delegate — asserted never-called. */
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

function ctx(over: Partial<OrganizationContext> = {}): OrganizationContext {
    return {
        organizationId: "org_1",
        userId: "user_1",
        // Changing the plan is the Owner's alone (DEC-131, amended).
        role: "OWNER",
        ...over,
    };
}

beforeEach(() => jest.clearAllMocks());

describe("SubscriptionsService authz", () => {
    it.each(["ADMIN", "MEMBER", "REVIEWER"] as const)(
        "denies %s subscribing and cancelling, in the owner-only sentence",
        async (role) => {
            const service = new SubscriptionsService();
            const refusal = { response: roleDenial("billing:manage") };

            await expect(
                service.subscribe(ctx({ role })),
            ).rejects.toMatchObject(refusal);
            await expect(service.cancel(ctx({ role }))).rejects.toMatchObject(
                refusal,
            );
            expect(planFindFirst).not.toHaveBeenCalled();
            expect(subFindUnique).not.toHaveBeenCalled();
        },
    );

    it("lets an ADMIN read the subscription (billing:read)", async () => {
        subFindUnique.mockResolvedValue(null);

        await expect(
            new SubscriptionsService().getCurrent(ctx({ role: "ADMIN" })),
        ).resolves.toBeNull();
    });

    it("denies a MEMBER reading the subscription (billing:read)", async () => {
        await expect(
            new SubscriptionsService().getCurrent(ctx({ role: "MEMBER" })),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(subFindUnique).not.toHaveBeenCalled();
    });
});

describe("the retired writes (17 Oct 2026)", () => {
    it("are Gone for the owner, and change nothing: no Free over a paid period, no provider left charging", async () => {
        const service = new SubscriptionsService();
        await expect(service.subscribe(ctx())).rejects.toBeInstanceOf(
            GoneException,
        );
        await expect(service.cancel(ctx())).rejects.toBeInstanceOf(
            GoneException,
        );
        for (const touched of [
            planFindFirst,
            subFindUnique,
            subUpsert,
            subUpdate,
            ...merchantDelegates(),
        ]) {
            expect(touched).not.toHaveBeenCalled();
        }
    });
});

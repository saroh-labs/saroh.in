/**
 * A website a move to a lower plan paused (#800) takes no orders for plans
 * either: joining one online is refused with `NOT_TAKING_ORDERS` before
 * anything is drafted, and the site's plans read shows the plans with Join
 * off and says the site isn't taking orders. What is paused is mocked.
 */
jest.mock("@saroh/database", () => ({
    prisma: {
        subscriptionPlan: { findFirst: jest.fn(), findMany: jest.fn() },
        organizationModule: { findFirst: jest.fn() },
        site: { findFirst: jest.fn() },
        $transaction: jest.fn(),
    },
    runInOrgContext: (_org: string, fn: () => unknown) => fn(),
}));

const siteTaking = jest.fn();
jest.mock("../orders/checkout-paused", () => ({
    ...jest.requireActual("../orders/checkout-paused"),
    siteTakingOrders: (...a: unknown[]) => siteTaking(...a),
}));

jest.mock("../organizations/organization-lifecycle.gate", () => ({
    assertOrganizationOpen: () => Promise.resolve(),
}));

jest.mock("../feature-flags/feature-flags.service", () => ({
    FeatureFlagService: class {
        isEnabled() {
            return Promise.resolve(true);
        }
    },
}));

jest.mock("../billing/online-payments-plan", () => ({
    planStartsSubscriptions: () => Promise.resolve(true),
}));

jest.mock("../bookings/public-booking-page", () => ({
    takesOnlinePayment: () => Promise.resolve(true),
}));

import { ConflictException } from "@nestjs/common";
import { prisma } from "@saroh/database";

import {
    NOT_TAKING_ORDERS,
    NOT_TAKING_ORDERS_MESSAGE,
} from "../billing/paused-errors";
import type { PaymentsService } from "../payments/payments.service";
import { PublicPlanJoinService } from "./public-plan-join.service";
import { PublicPlansService } from "./public-plans.service";

const planFindFirst = prisma.subscriptionPlan.findFirst as jest.Mock;
const planFindMany = prisma.subscriptionPlan.findMany as jest.Mock;
const moduleFindFirst = prisma.organizationModule.findFirst as jest.Mock;
const siteFindFirst = prisma.site.findFirst as jest.Mock;
const transaction = prisma.$transaction as jest.Mock;

const CUSTOMER = {
    organizationId: "org_1",
    siteId: "site_2",
    accountId: "acc_1",
    contactId: "contact_1",
};

function joins() {
    return new PublicPlanJoinService({} as PaymentsService);
}

beforeEach(() => {
    jest.clearAllMocks();
    siteTaking.mockResolvedValue(true);
    moduleFindFirst.mockResolvedValue({ id: "mod_payments" });
    planFindMany.mockResolvedValue([]);
    siteFindFirst.mockResolvedValue({ organizationId: "org_1" });
});

describe("joining a plan online on a paused website (#800)", () => {
    it("is refused with NOT_TAKING_ORDERS in the customer's words, before anything is drafted", async () => {
        siteTaking.mockResolvedValue(false);
        const err = await joins()
            .start(CUSTOMER, "plan_1", "key_1")
            .catch((e: unknown) => e);
        expect(err).toBeInstanceOf(ConflictException);
        expect((err as ConflictException).getResponse()).toEqual({
            message: NOT_TAKING_ORDERS_MESSAGE,
            details: { code: NOT_TAKING_ORDERS, reason: "notTakingOrders" },
        });
        expect(siteTaking).toHaveBeenCalledWith("org_1", "site_2");
        expect(planFindFirst).not.toHaveBeenCalled();
        expect(transaction).not.toHaveBeenCalled();
    });

    it("goes on to the plan when the site takes orders", async () => {
        planFindFirst.mockResolvedValue(null);
        await expect(
            joins().start(CUSTOMER, "plan_1", "key_1"),
        ).rejects.toThrow("Plan not found");
        expect(planFindFirst).toHaveBeenCalled();
    });
});

describe("the site's plans read on a paused website (#800)", () => {
    it("shows the plans with Join off, and says the site isn't taking orders", async () => {
        siteTaking.mockResolvedValue(false);
        await expect(
            new PublicPlansService().list("site_2", "visitor"),
        ).resolves.toEqual({
            payOnline: false,
            autopayMethods: [],
            offered: true,
            plans: [],
            notTakingOrders: true,
        });
    });

    it("is unchanged while the site takes orders", async () => {
        await expect(
            new PublicPlansService().list("site_1", "visitor"),
        ).resolves.toEqual({
            payOnline: true,
            autopayMethods: [],
            offered: true,
            plans: [],
        });
    });
});

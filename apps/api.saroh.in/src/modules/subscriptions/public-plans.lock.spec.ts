/**
 * The site's plans on a Saroh plan without memberships (6 Oct 2026): none.
 * The Plans block then draws nothing — never a card that can only say "Ask
 * about joining". Unchanged on a plan with memberships, and with plan
 * enforcement off. The database is mocked; the real rows are in
 * `membership-plan-lock.db.spec.ts`.
 */
jest.mock("@saroh/database", () => {
    const actual = jest.requireActual("@saroh/database");
    return {
        ...actual,
        runInOrgContext: (_org: string, fn: () => unknown) => fn(),
        prisma: {
            // An active business (DEC-120): its site takes orders.
            organization: {
                findUnique: jest
                    .fn()
                    .mockResolvedValue({ lifecycleStatus: "ACTIVE" }),
            },
            site: {
                findFirst: jest
                    .fn()
                    .mockResolvedValue({ organizationId: "org_1" }),
            },
            organizationModule: {
                findFirst: jest.fn().mockResolvedValue({ id: "m_1" }),
            },
            subscriptionPlan: { findMany: jest.fn() },
        },
    };
});
// Payments rolled out for the business.
jest.mock("../feature-flags/feature-flags.service", () => ({
    FeatureFlagService: class {
        isEnabled = jest.fn().mockResolvedValue(true);
    },
}));
jest.mock("../bookings/public-booking-page", () => ({
    takesOnlinePayment: jest.fn().mockResolvedValue(true),
}));

import { prisma } from "@saroh/database";

import { fakePaymentsRow } from "../../../test/fixtures/pricing-catalog";
import { planMeter } from "../billing/metering.service";
import { FixedWindowRateLimiter } from "../bookings/rate-limiter";
import { PublicPlansService } from "./public-plans.service";

const findMany = (
    prisma as unknown as { subscriptionPlan: { findMany: jest.Mock } }
).subscriptionPlan.findMany;

const MONTHLY = {
    id: "plan_1",
    name: "Monthly",
    description: null,
    price: "1500",
    currency: "INR",
    interval: "MONTH",
    _count: { subscriptions: 2 },
};

function onPlan(planId: "free" | "grow" | null) {
    return jest
        .spyOn(planMeter, "enforcedRow")
        .mockImplementation((_org: string, moduleId: string) =>
            Promise.resolve(
                planId === null
                    ? null
                    : fakePaymentsRow(
                          planId,
                          moduleId as "payments" | "subscriptions",
                      ),
            ),
        );
}

const service = () =>
    new PublicPlansService(new FixedWindowRateLimiter(1000, 60_000));

beforeEach(() => {
    jest.restoreAllMocks();
    findMany.mockReset().mockResolvedValue([MONTHLY]);
});

describe("the site's plans and the business's Saroh plan", () => {
    it("lists none on a plan without memberships, and says so to the editor", async () => {
        onPlan("free");
        await expect(service().list("site_1", "v1")).resolves.toEqual({
            plans: [],
            payOnline: false,
            autopayMethods: [],
            offered: false,
        });
        expect(findMany).not.toHaveBeenCalled();
    });

    it("lists what is on sale on a plan with memberships", async () => {
        onPlan("grow");
        const read = await service().list("site_1", "v1");
        expect(read.offered).toBe(true);
        expect(read.payOnline).toBe(true);
        expect(read.plans.map((p) => p.name)).toEqual(["Monthly"]);
    });

    it("lists what is on sale with plan enforcement off", async () => {
        onPlan(null);
        const read = await service().list("site_1", "v1");
        expect(read.offered).toBe(true);
        expect(read.plans).toHaveLength(1);
    });
});

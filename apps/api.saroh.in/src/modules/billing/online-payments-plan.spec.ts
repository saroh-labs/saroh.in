/**
 * The plan's say over taking money online (`online-payments-plan.ts`),
 * without a database: new online payments and new subscriptions are
 * refused on a plan without the `payments` row; a renewal of a
 * subscription the business already has never is. `planMeter` is spied
 * on, so each case reads the row it names; behind the kill switch, or
 * when the plan can't be read, `enforcedRow` is null and nothing is
 * refused. The same against Postgres: `online-payments-plan.db.spec.ts`.
 *
 * Catalogue rows are made up (`fakePaymentsCatalog`).
 */
import { ForbiddenException } from "@nestjs/common";

import { fakePaymentsRow } from "../../../test/fixtures/pricing-catalog";
import { planMeter } from "./metering.service";
import {
    assertPlanStartsSubscriptions,
    assertPlanTakesOnlinePayment,
    isRenewalInvoice,
    noProviderReason,
    planStartsSubscriptions,
    planTakesInvoiceOnline,
    planTakesOnlinePayment,
} from "./online-payments-plan";

/** The business is on `plan`; null: nothing enforced (switch off, unread). */
function onPlan(plan: "free" | "grow" | null): jest.SpyInstance {
    return jest
        .spyOn(planMeter, "enforcedRow")
        .mockImplementation((_org: string, moduleId: string) =>
            Promise.resolve(
                plan === null
                    ? null
                    : fakePaymentsRow(
                          plan,
                          moduleId as "payments" | "subscriptions",
                      ),
            ),
        );
}

async function refusal(p: Promise<unknown>) {
    const err = await p.then(
        () => null,
        (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ForbiddenException);
    return (err as ForbiddenException).getResponse() as {
        message: string;
        details: Record<string, unknown>;
    };
}

afterEach(() => jest.restoreAllMocks());

describe("online payments on the plan", () => {
    it("refuses a new online payment with MODULE_LOCKED on a plan without it", async () => {
        onPlan("free");

        await expect(planTakesOnlinePayment("org_1")).resolves.toBe(false);
        const body = await refusal(assertPlanTakesOnlinePayment("org_1"));
        expect(body.details).toMatchObject({
            code: "MODULE_LOCKED",
            moduleId: "payments",
            plan: { id: "free", name: "Plan A" },
            upgradeTo: { planId: "grow", name: "Plan B" },
        });
        expect(body.message).toBe(
            "Online payments isn't in your Plan A plan. It comes with Plan B.",
        );
    });

    it("lets it through on a plan with it", async () => {
        onPlan("grow");

        await expect(planTakesOnlinePayment("org_1")).resolves.toBe(true);
        await expect(
            assertPlanTakesOnlinePayment("org_1"),
        ).resolves.toBeUndefined();
    });

    it("refuses nothing behind the kill switch, or when the plan can't be read", async () => {
        const spy = onPlan(null);

        await expect(planTakesOnlinePayment("org_1")).resolves.toBe(true);
        await expect(
            assertPlanTakesOnlinePayment("org_1"),
        ).resolves.toBeUndefined();
        await expect(planStartsSubscriptions("org_1")).resolves.toBe(true);
        expect(spy).toHaveBeenCalled();
    });
});

describe("new subscriptions on the plan", () => {
    it("refuses one, naming memberships first", async () => {
        onPlan("free");

        await expect(planStartsSubscriptions("org_1")).resolves.toBe(false);
        const body = await refusal(assertPlanStartsSubscriptions("org_1"));
        expect(body.details).toMatchObject({
            code: "MODULE_LOCKED",
            moduleId: "subscriptions",
        });
    });

    it("refuses one when memberships are in but online payments aren't", async () => {
        jest.spyOn(planMeter, "enforcedRow").mockImplementation(
            (_org: string, moduleId: string) =>
                Promise.resolve(
                    moduleId === "subscriptions"
                        ? fakePaymentsRow("grow", "subscriptions")
                        : fakePaymentsRow("free", "payments"),
                ),
        );

        await expect(planStartsSubscriptions("org_1")).resolves.toBe(false);
        const body = await refusal(assertPlanStartsSubscriptions("org_1"));
        expect(body.details).toMatchObject({ moduleId: "payments" });
    });

    it("starts one on a plan with both", async () => {
        onPlan("grow");

        await expect(planStartsSubscriptions("org_1")).resolves.toBe(true);
        await expect(
            assertPlanStartsSubscriptions("org_1"),
        ).resolves.toBeUndefined();
    });
});

describe("renewals the business already has (never refused)", () => {
    it("keeps a renewal invoice payable online on a plan without payments, without asking the plan", async () => {
        const spy = onPlan("free");

        expect(isRenewalInvoice({ subscriptionId: "sub_1" })).toBe(true);
        await expect(
            planTakesInvoiceOnline("org_1", { subscriptionId: "sub_1" }),
        ).resolves.toBe(true);
        expect(spy).not.toHaveBeenCalled();
    });

    it("but not an invoice of its own, nor a plan join's draft (no subscription yet)", async () => {
        onPlan("free");

        expect(isRenewalInvoice({ subscriptionId: null })).toBe(false);
        expect(isRenewalInvoice(null)).toBe(false);
        await expect(
            planTakesInvoiceOnline("org_1", { subscriptionId: null }),
        ).resolves.toBe(false);
        await expect(planTakesInvoiceOnline("org_1", undefined)).resolves.toBe(
            false,
        );
    });
});

describe("no provider connected: whose fix it is (UX-017)", () => {
    it("says the plan when it has no room for one more own account", async () => {
        jest.spyOn(planMeter, "hasRoom").mockResolvedValue(false);
        await expect(noProviderReason("org_1")).resolves.toBe("PLAN");
    });

    it("says connect one where the plan lets it, or can't be read", async () => {
        const room = jest.spyOn(planMeter, "hasRoom").mockResolvedValue(true);
        await expect(noProviderReason("org_1")).resolves.toBe("NO_PROVIDER");
        room.mockRejectedValue(new Error("down"));
        await expect(noProviderReason("org_1")).resolves.toBe("NO_PROVIDER");
    });
});

/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { SarohSubscriptionDetail } from "@/lib/billing-words";

vi.mock("@/lib/billing-actions", () => ({
    resolveBillingActionAction: vi.fn(),
    endAutopayAction: vi.fn(),
    recheckRefundAction: vi.fn(),
    syncCustomerAction: vi.fn(),
    recordRefundAction: vi.fn(),
}));

import { SubscriptionBilling } from "./subscription-billing";

afterEach(cleanup);

const PLAN = { key: "grow", name: "Grow", version: 1, interval: "month" };

function detail(
    billingProfile: SarohSubscriptionDetail["billingProfile"],
): SarohSubscriptionDetail {
    return {
        subscription: {
            id: "sub_row",
            organization: { id: "org_rye", name: "Rye and Co", slug: "rye" },
            plan: PLAN,
            status: "ACTIVE",
            billingCycle: "MONTHLY",
            currentPeriodEnd: null,
            cancelAtPeriodEnd: false,
            freeChosenAt: null,
            pending: null,
            provider: "RAZORPAY",
            providerSubscriptionId: null,
            providerCustomerId: null,
            termEndsAt: null,
            termPayment: null,
            nextChargeAt: null,
            nextChargeHow: "NONE",
            autopayRunsOutSoon: false,
            billingProfile: null,
            lastInvoice: null,
        },
        billingProfile,
        invoices: [],
        refunds: [],
        doubleCharges: [],
        openActions: [],
        checkouts: [],
        events: [],
    };
}

/**
 * The sheet's "Billing profile" section (DEC-167): who Saroh bills the
 * business to, the profile's Razorpay customer and sync, and the other
 * businesses billed to the same profile.
 */
describe("SubscriptionBilling › Billing profile", () => {
    it("shows the profile, its customer and the other businesses on it", () => {
        const { container } = render(
            <SubscriptionBilling
                canAct={false}
                detail={detail({
                    id: "bp_1",
                    legalName: "Asha Rao Enterprises",
                    billingEmail: "accounts@example.com",
                    gstin: "29ABCDE1234F1Z5",
                    provider: "RAZORPAY",
                    providerCustomerId: "cust_Abc123",
                    syncedAt: null,
                    lastError: "Razorpay customer update failed (HTTP 400)",
                    contactWithheld: true,
                    otherBusinesses: [
                        { id: "org_mill", name: "Mill Street" },
                        { id: "org_pulse", name: "Pulse Studio" },
                    ],
                })}
            />,
        );

        expect(
            screen.getByRole("heading", { name: "Billing profile" }),
        ).toBeTruthy();
        expect(screen.queryByText("Razorpay customer")).toBeNull();
        expect(screen.getByText("Asha Rao Enterprises")).toBeTruthy();
        const text = container.textContent;
        expect(text).toContain("accounts@example.com · GSTIN 29ABCDE1234F1Z5");
        expect(screen.getByRole("link", { name: "cust_Abc123" })).toBeTruthy();
        expect(text).toContain("Never synced");
        expect(text).toContain("made without the phone");
        expect(text).toContain(
            "Last sync failed: Razorpay customer update failed (HTTP 400)",
        );
        expect(text).toContain("Also bills Mill Street, Pulse Studio.");
    });

    it("says when the profile bills only this business, and offers no sync to a reader", () => {
        const { container } = render(
            <SubscriptionBilling
                canAct={false}
                detail={detail({
                    id: "bp_1",
                    legalName: "Rye and Co",
                    billingEmail: "rye@example.com",
                    gstin: null,
                    provider: "RAZORPAY",
                    providerCustomerId: null,
                    syncedAt: "2026-10-18T05:00:00.000Z",
                    lastError: null,
                    contactWithheld: false,
                    otherBusinesses: [],
                })}
            />,
        );

        const text = container.textContent;
        expect(text).toContain("rye@example.com · No GSTIN");
        expect(text).toContain("No customer at RAZORPAY yet.");
        expect(text).toContain("Bills only this business.");
        expect(screen.queryByRole("button", { name: "Sync again" })).toBeNull();
    });

    it("says a business with no profile yet chooses one before paying, with nothing to sync", () => {
        const { container } = render(
            <SubscriptionBilling canAct detail={detail(null)} />,
        );

        expect(container.textContent).toContain(
            "No billing profile yet. An owner chooses one in Plan & billing before paying.",
        );
        expect(screen.queryByRole("button", { name: "Sync again" })).toBeNull();
    });
});

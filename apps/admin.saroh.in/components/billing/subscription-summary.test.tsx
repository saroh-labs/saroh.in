/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { subscriptionDetail } from "@/test/subscription-fixture";

vi.mock("@/lib/billing-actions", () => ({
    resolveBillingActionAction: vi.fn(),
    endAutopayAction: vi.fn(),
    recheckRefundAction: vi.fn(),
    syncCustomerAction: vi.fn(),
    recordRefundAction: vi.fn(),
}));

import { SubscriptionSummary } from "./subscription-summary";

afterEach(cleanup);

/**
 * The Summary's billing profile (DEC-167): who Saroh bills the business
 * to, the profile's sync, and the other businesses billed to the same
 * profile. Sync shows only to an operator who may act, with a profile.
 */
describe("SubscriptionSummary › Billing profile", () => {
    it("shows the profile, its sync and the other businesses on it", () => {
        const { container } = render(
            <SubscriptionSummary
                canAct={false}
                detail={subscriptionDetail({
                    billingProfile: {
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
                    },
                })}
            />,
        );

        expect(screen.getByText("Asha Rao Enterprises")).toBeTruthy();
        const text = container.textContent;
        expect(text).toContain("accounts@example.com");
        expect(text).toContain("GSTIN 29ABCDE1234F1Z5");
        expect(screen.getByRole("link", { name: "cust_Abc123" })).toBeTruthy();
        expect(text).toContain("never synced");
        expect(text).toContain("made without the phone");
        expect(text).toContain("Last sync failed.");
        expect(text).toContain("Also bills Mill Street, Pulse Studio.");
        expect(screen.queryByRole("button", { name: "Sync again" })).toBeNull();
    });

    it("says when the profile bills only this business", () => {
        const { container } = render(
            <SubscriptionSummary canAct detail={subscriptionDetail()} />,
        );
        const text = container.textContent;
        expect(text).toContain("No GSTIN");
        expect(text).toContain("Bills only this business.");
        expect(screen.getByRole("button", { name: "Sync again" })).toBeTruthy();
    });

    it("says a business with no profile yet chooses one before paying, with nothing to sync", () => {
        const { container } = render(
            <SubscriptionSummary
                canAct
                detail={subscriptionDetail({ billingProfile: null })}
            />,
        );

        expect(container.textContent).toContain(
            "None yet. An owner chooses one in Plan & billing before paying.",
        );
        expect(container.textContent).toContain(
            "No billing profile to sync yet.",
        );
        expect(screen.queryByRole("button", { name: "Sync again" })).toBeNull();
    });
});

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { PickerRow } from "@/lib/saroh-billing/plan-view";

import { CheckoutPending } from "./checkout-pending";
import { PlanChooser } from "./plan-chooser";

vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
    usePathname: () => "/settings/billing",
    useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/saroh-billing/billing-actions", () => ({
    checkCouponAction: vi.fn(),
    confirmCheckoutAction: vi.fn(),
    changePlanAction: vi.fn(),
    quoteChangeAction: vi.fn(),
}));

/**
 * Settings › Plan and billing's parts, drawn on the server (UX-003,
 * UX-044, UX-045). Made-up plans and prices.
 */

const rows: PickerRow[] = [
    {
        planId: "a",
        name: "Plan A",
        price: "₹0",
        what: "For A.",
        current: false,
        cta: null,
        lead: "",
        lines: ["10 things"],
        note: { lead: "After ", iso: "2027-12-31T00:00:00.000Z" },
    },
    {
        planId: "b",
        name: "Plan B",
        price: "₹111 a month + GST",
        what: "For B.",
        current: true,
        cta: "Keep Plan B",
        lead: "Everything in Plan A, plus:",
        lines: ["Take payments online", "A team of 3"],
        note: {
            lead: "You're on this until ",
            iso: "2027-12-31T00:00:00.000Z",
        },
    },
];

describe("PlanChooser", () => {
    it("sells each plan: its price before GST, what it unlocks, and where the business stands", () => {
        const html = renderToStaticMarkup(
            <PlanChooser
                rows={{ month: rows, year: rows }}
                yearly={{ on: false }}
                initialCycle="month"
                canChange
                addons={null}
                currentPlan="Plan B"
            />,
        );
        expect(html).toContain("₹111 a month + GST");
        expect(html).toContain("Everything in Plan A, plus:");
        expect(html).toContain("Take payments online");
        expect(html).toContain("You&#x27;re on this until");
        expect(html).toContain("After ");
        // The plan held for a while offers to keep it, not a trial.
        expect(html).toContain("Keep Plan B");
        expect(html).not.toContain("trial");
    });
});

describe("CheckoutPending", () => {
    it("checks with Razorpay on arrival and never offers to start again", () => {
        const html = renderToStaticMarkup(
            <CheckoutPending
                pending={{
                    planName: "Plan B",
                    expiresAt: "2026-10-08T00:00:00.000Z",
                    handoff: null,
                }}
            />,
        );
        expect(html).toContain("Checking your payment for Plan B with");
        expect(html).not.toMatch(/start again/i);
    });
});

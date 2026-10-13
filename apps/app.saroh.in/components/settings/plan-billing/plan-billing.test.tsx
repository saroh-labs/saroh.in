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

    it("says when a change would start, and offers no button for one that already waits (DEC-159)", () => {
        const timed: PickerRow[] = [
            {
                ...rows[0],
                cta: null,
                note: {
                    lead: "From ",
                    iso: "2027-12-31T00:00:00.000Z",
                    tail: ": you keep Plan B until then.",
                },
            },
            { ...rows[1], cta: null, note: null },
            {
                ...rows[1],
                planId: "c",
                name: "Plan C",
                current: false,
                cta: "Upgrade",
                note: {
                    lead: "Starts today: ₹65.49 now (incl. GST)",
                    iso: null,
                },
            },
        ];
        const html = renderToStaticMarkup(
            <PlanChooser
                rows={{ month: timed, year: timed }}
                yearly={{ on: false }}
                initialCycle="month"
                canChange
                addons={null}
                currentPlan="Plan B"
            />,
        );
        expect(html).toMatch(
            /From <time[^>]*>[^<]*2027<\/time>: you keep Plan B until then\./,
        );
        expect(html).toContain("Starts today: ₹65.49 now (incl. GST)");
        expect(html).toContain(
            "Upgrades start today. A cheaper plan or Free starts when what you&#x27;ve paid for ends.",
        );
        // One button: the upgrade. The plan it moves to has none.
        expect(html.match(/aria-label="[^"]*: Plan [A-C]"/g)).toEqual([
            'aria-label="Upgrade: Plan C"',
        ]);
    });

    it("says nothing of yearly when the catalogue has no yearly billing", () => {
        const draw = (
            yearly: { on: false } | { on: true; freeMonths: number },
        ) =>
            renderToStaticMarkup(
                <PlanChooser
                    rows={{ month: rows, year: rows }}
                    yearly={yearly}
                    initialCycle="month"
                    canChange
                    addons={null}
                    currentPlan="Plan B"
                />,
            );
        expect(draw({ on: false })).toContain(
            "Plans are paid monthly by autopay, for 12 months.",
        );
        expect(draw({ on: false })).not.toMatch(/yearly/i);
        expect(draw({ on: true, freeMonths: 2 })).toContain(
            "yearly is one payment",
        );
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

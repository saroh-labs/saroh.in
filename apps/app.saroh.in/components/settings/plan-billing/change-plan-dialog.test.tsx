// @vitest-environment jsdom
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ChangeQuote } from "@/lib/saroh-billing/plan-view";

import { ChangePlanDialog } from "./change-plan-dialog";

vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
}));
const quoteChangeAction = vi.fn();
vi.mock("@/lib/saroh-billing/billing-actions", () => ({
    changePlanAction: vi.fn(),
    confirmCheckoutAction: vi.fn(),
    quoteChangeAction: (...args: unknown[]) =>
        quoteChangeAction(...args) as unknown,
}));

/**
 * The change-plan dialog's note on add-ons that end with the change
 * (DEC-157): said before Confirm, from the API's quote, and never drawn
 * when none ends. Drawn with `react-dom/client` + `act` on the real dialog.
 * Made-up plans, add-ons and prices.
 */

const quote = (over: Partial<ChangeQuote> = {}): ChangeQuote => ({
    plan: { id: "c", name: "Plan C", version: 3 },
    cycle: "month",
    kind: "UPGRADE",
    pricePaise: 33_300,
    gstPaise: 5_994,
    totalPaise: 39_294,
    chargeNowPaise: 1_110,
    chargeNowGstPaise: 200,
    chargeNowTotalPaise: 1_310,
    startAt: "2027-03-21T00:00:00.000Z",
    effectiveAt: null,
    trialEndsAt: null,
    coupon: null,
    firstChargePaise: 33_300,
    firstChargeGstPaise: 5_994,
    firstChargeTotalPaise: 39_294,
    payment: "AUTOPAY",
    termCharges: 12,
    payNowTotalPaise: 1_310,
    mandateCheck: "PAID",
    ...over,
});

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    quoteChangeAction.mockReset();
});

afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = "";
});

/** The dialog open on Plan C, once its quote has landed. */
async function open(q: unknown) {
    quoteChangeAction.mockResolvedValue({ ok: true, data: q });
    await act(async () => {
        root.render(
            <ChangePlanDialog
                picked={{ planId: "c", name: "Plan C", cycle: "month" }}
                coupon=""
                currentPlan="Plan B"
                onCouponRefused={vi.fn()}
                onClose={vi.fn()}
            />,
        );
        await Promise.resolve();
    });
    const dialog = document.querySelector('[role="dialog"]');
    if (!dialog) throw new Error("the dialog didn't open");
    return dialog;
}

const notes = (dialog: Element) =>
    Array.from(dialog.querySelectorAll('[role="note"]'), (n) => n.textContent);

describe("ChangePlanDialog: add-ons that end with the change", () => {
    it("says which add-ons end, how many, and that the new plan's own can be added after", async () => {
        const dialog = await open(
            quote({
                addonsEnding: [
                    {
                        id: "person-b",
                        name: "One more person",
                        quantity: 2,
                        onNewPlan: "One more person on C",
                    },
                    {
                        id: "bills",
                        name: "Bills on their own",
                        quantity: 1,
                        onNewPlan: null,
                    },
                ],
            }),
        );
        expect(notes(dialog)).toEqual([
            "These add-ons end with Plan B: One more person × 2, Bills on their own. After the change you can add One more person on C on Plan C, from Add-ons on this page. Nothing is added for you.",
        ]);
        // Said before the business confirms, with the way on still there.
        expect(dialog.textContent).toContain("Continue to payment");
        // No price for an add-on it hasn't chosen.
        expect(notes(dialog).join(" ")).not.toContain("₹");
    });

    it("draws nothing when no add-on ends", async () => {
        const dialog = await open(quote({ addonsEnding: [] }));
        expect(dialog.textContent).toContain("Upgrade to Plan C");
        expect(notes(dialog)).toEqual([]);
    });

    it("an API from before the field reads as none ending", async () => {
        const { addonsEnding: _none, ...older } = quote();
        const dialog = await open(older);
        expect(dialog.textContent).toContain("Upgrade to Plan C");
        expect(notes(dialog)).toEqual([]);
    });
});

describe("ChangePlanDialog: when the change starts (DEC-159)", () => {
    const description = (dialog: Element) =>
        dialog.querySelector("p")?.textContent ?? "";

    it("a dearer plan chosen during the first month: starts today, the amount now, and the month ends", async () => {
        const dialog = await open(
            quote({
                kind: "NEW",
                firstMonth: "NOW",
                chargeNowPaise: 0,
                chargeNowGstPaise: 0,
                chargeNowTotalPaise: 0,
                startAt: null,
                payNowTotalPaise: 39_294,
            }),
        );
        expect(dialog.textContent).toContain("Upgrade to Plan C");
        const rows = Array.from(dialog.querySelectorAll("dl > div"), (r) => [
            r.querySelector("dt")?.textContent,
            r.querySelector("dd")?.textContent,
        ]);
        expect(rows[0]).toEqual(["Starts today", "₹392.94 now (incl. GST)"]);
        expect(description(dialog)).toContain(
            "your first month on Plan B ends now",
        );
        expect(description(dialog)).toContain("isn't refunded");
        expect(description(dialog)).not.toMatch(/^From /);
        expect(dialog.textContent).toContain("Continue to payment");
    });

    it("a cheaper plan: from the date, with the plan kept until then", async () => {
        const dialog = await open(
            quote({
                kind: "SCHEDULED",
                firstMonth: "AT_END",
                plan: { id: "a2", name: "Plan A2", version: 3 },
                chargeNowPaise: 0,
                chargeNowGstPaise: 0,
                chargeNowTotalPaise: 0,
                startAt: "2099-03-21T00:00:00.000Z",
                effectiveAt: "2099-03-21T00:00:00.000Z",
                payNowTotalPaise: 0,
                mandateCheck: "REFUNDED",
            }),
        );
        expect(description(dialog)).toMatch(
            /^From .*2099: you keep Plan B until then\. Your first month runs to its end first, and nothing more is charged for Plan B\./,
        );
        expect(dialog.textContent).toContain("Continue to payment");
    });

    it("Free: from the date, the plan kept, nothing more charged, and no payment", async () => {
        const dialog = await open(
            quote({
                kind: "TO_FREE",
                plan: { id: "a", name: "Plan A", version: 3 },
                chargeNowPaise: 0,
                chargeNowGstPaise: 0,
                chargeNowTotalPaise: 0,
                startAt: null,
                effectiveAt: "2099-03-21T00:00:00.000Z",
                payNowTotalPaise: 0,
                mandateCheck: "NONE",
            }),
        );
        expect(description(dialog)).toMatch(
            /^From .*2099: you keep Plan B until then\. Nothing more is charged\./,
        );
        expect(dialog.textContent).toContain("Move to Plan A");
        expect(dialog.textContent).not.toContain("Continue to payment");
    });
});

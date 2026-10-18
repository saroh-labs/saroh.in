// @vitest-environment jsdom
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ChangeQuote } from "@/lib/saroh-billing/plan-view";

import { CancelPlan } from "./cancel-plan";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh, replace: vi.fn(), push: vi.fn() }),
}));
const quoteChangeAction = vi.fn();
const changePlanAction = vi.fn();
vi.mock("@/lib/saroh-billing/billing-actions", () => ({
    changePlanAction: (...args: unknown[]) =>
        changePlanAction(...args) as unknown,
    quoteChangeAction: (...args: unknown[]) =>
        quoteChangeAction(...args) as unknown,
}));
const showError = vi.fn();
const showSuccess = vi.fn();
vi.mock("@saroh/ui/toast", () => ({
    showError: (...args: unknown[]) => showError(...args) as unknown,
    showSuccess: (...args: unknown[]) => showSuccess(...args) as unknown,
    showInfo: vi.fn(),
}));

/**
 * "Cancel plan" under Your plan (owner, 17 Oct 2026): the API's quote for
 * Free first, so the date in the confirm is the API's; then one confirm,
 * "Keep Plan B" or "Cancel plan"; then the move to Free and the page read
 * again. Drawn with `react-dom/client` + `act` on the real component.
 * Made-up plans and dates.
 */

const END = "2031-11-13T00:00:00.000Z";

const freeQuote = (over: Partial<ChangeQuote> = {}): ChangeQuote => ({
    plan: { id: "a", name: "Plan A", version: 3 },
    cycle: "month",
    kind: "TO_FREE",
    pricePaise: 0,
    gstPaise: 0,
    totalPaise: 0,
    chargeNowPaise: 0,
    chargeNowGstPaise: 0,
    chargeNowTotalPaise: 0,
    startAt: null,
    effectiveAt: END,
    trialEndsAt: null,
    coupon: null,
    firstChargePaise: 0,
    firstChargeGstPaise: 0,
    firstChargeTotalPaise: 0,
    payment: "AUTOPAY",
    termCharges: 12,
    payNowTotalPaise: 0,
    mandateCheck: "NONE",
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
    vi.clearAllMocks();
});

afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = "";
});

/** The first button inside `within` (the page by default) with this name. */
const buttonNamed = (
    name: string,
    within: ParentNode | null = document,
): HTMLButtonElement | undefined =>
    Array.from(
        within?.querySelectorAll<HTMLButtonElement>("button") ?? [],
    ).find((b) => b.textContent.trim() === name);

async function press(button: HTMLButtonElement | undefined) {
    expect(button).toBeDefined();
    await act(async () => {
        button?.click();
        await Promise.resolve();
    });
}

/** Drawn, with Cancel plan pressed once the quote has an answer. */
async function openConfirm(quote: unknown, yearly = false) {
    quoteChangeAction.mockResolvedValue(quote);
    act(() =>
        root.render(
            <CancelPlan
                offer={{
                    planName: "Plan B",
                    freePlanId: "a",
                    freePlanName: "Plan A",
                    yearly,
                }}
            />,
        ),
    );
    await press(buttonNamed("Cancel plan"));
}

const dialog = () => document.querySelector('[role="alertdialog"]');

describe("Cancel plan", () => {
    it("asks the API for Free's quote, then confirms with its date", async () => {
        await openConfirm({ ok: true, data: freeQuote() });
        expect(quoteChangeAction).toHaveBeenCalledWith({
            plan: "a",
            cycle: "month",
        });
        const text = dialog()?.textContent ?? "";
        expect(text).toContain("Cancel your plan?");
        expect(text).toContain(
            "Autopay stops, so nothing more is charged. You keep Plan B until",
        );
        expect(text).toContain("then move to Plan A.");
        expect(text).toContain("This cannot be undone.");
        // The date is the API's, drawn for the viewer.
        expect(
            dialog()?.querySelector(`time[datetime="${END}"]`),
        ).not.toBeNull();
        expect(buttonNamed("Keep Plan B")).toBeDefined();
        expect(changePlanAction).not.toHaveBeenCalled();
    });

    it("on a year paid once, says nothing of autopay", async () => {
        await openConfirm({ ok: true, data: freeQuote() }, true);
        const text = dialog()?.textContent ?? "";
        expect(text).toContain("We won't ask you to pay for another year.");
        expect(text).not.toMatch(/autopay/i);
    });

    it("Keep Plan B closes it and changes nothing", async () => {
        await openConfirm({ ok: true, data: freeQuote() });
        await press(buttonNamed("Keep Plan B"));
        expect(dialog()).toBeNull();
        expect(changePlanAction).not.toHaveBeenCalled();
    });

    it("Cancel plan moves to Free, says until when, and reads the page again", async () => {
        await openConfirm({ ok: true, data: freeQuote() });
        changePlanAction.mockResolvedValue({
            ok: true,
            data: { kind: "TO_FREE", effectiveAt: END },
        });
        await press(buttonNamed("Cancel plan", dialog()));
        expect(changePlanAction).toHaveBeenCalledWith({
            plan: "a",
            cycle: "month",
        });
        expect(showSuccess).toHaveBeenCalledWith(
            expect.stringMatching(/^Plan cancelled\. You keep Plan B until /),
        );
        expect(refresh).toHaveBeenCalled();
        expect(dialog()).toBeNull();
    });

    it("a refusal keeps the confirm open with the reason", async () => {
        await openConfirm({ ok: true, data: freeQuote() });
        changePlanAction.mockResolvedValue({
            ok: false,
            error: "Only the owner can change the plan.",
        });
        await press(buttonNamed("Cancel plan", dialog()));
        expect(dialog()?.textContent).toContain(
            "Only the owner can change the plan.",
        );
        expect(refresh).not.toHaveBeenCalled();
    });

    it("a quote that can't be had is said, and nothing opens", async () => {
        await openConfirm({ ok: false, error: "Saroh couldn't be reached." });
        expect(showError).toHaveBeenCalledWith("Saroh couldn't be reached.");
        expect(dialog()).toBeNull();
    });
});

// @vitest-environment jsdom
/**
 * Booking a plan change onto a plan with no GST rate (12 Oct 2026): the API
 * refuses it for a GST-registered business, the rate is asked for in place,
 * saved on the plan, and the same change is booked. Closing the sheet books
 * nothing and says nothing.
 *
 * `react-dom/client` + `act` directly, as the other component tests do.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    pickRate,
    ratePicker,
} from "@/components/shared/gst-rate-picker.testing";

import type { Plan, Subscription } from "@/lib/subscriptions/service";

import { useSubscriptionActions } from "./use-subscription-actions";

const saveGstRates = vi.fn();
vi.mock("@/lib/gst-rates/actions", () => ({
    saveGstRates: (...args: unknown[]) => saveGstRates(...args) as unknown,
}));

const actions = vi.hoisted(() => ({
    cancelPlanChange: vi.fn(),
    cancelSubscription: vi.fn(),
    changePlan: vi.fn(),
    keepSubscription: vi.fn(),
    pauseSubscription: vi.fn(),
    resumeSubscription: vi.fn(),
    retrySubscription: vi.fn(),
    skipCollection: vi.fn(),
    unskipCollection: vi.fn(),
}));
vi.mock("@/lib/subscriptions/actions", () => actions);
vi.mock("@/lib/invoices/link-actions", () => ({ newPayLink: vi.fn() }));

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn() }),
}));

const toast = vi.hoisted(() => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
    showUndo: vi.fn(),
}));
vi.mock("@saroh/ui/toast", async (importOriginal) => ({
    ...(await importOriginal<object>()),
    ...toast,
}));

// The product's select opens a portal jsdom can't press: a native select
// stands in, with the same options, placeholder and wiring.
vi.mock("@saroh/ui/option-select", () => ({
    OptionSelect: ({
        value,
        onValueChange,
        options,
        placeholder,
        ...aria
    }: {
        value: string;
        onValueChange: (v: string) => void;
        options: { value: string; label: string }[];
        placeholder?: string;
        "aria-label"?: string;
    }) => (
        <select
            aria-label={aria["aria-label"]}
            value={value}
            onChange={(e) => onValueChange(e.target.value)}
        >
            <option value="">{placeholder}</option>
            {options.map((o) => (
                <option key={o.value} value={o.value}>
                    {o.label}
                </option>
            ))}
        </select>
    ),
}));

const SUB = {
    id: "sub_1",
    status: "ACTIVE",
    plan: { id: "pl_silver", name: "Silver monthly" },
    contact: { id: "c_asha", name: "Asha Rao", email: "asha@example.com" },
    timezone: "Asia/Kolkata",
    currentPeriodEnd: "2026-11-04T00:00:00.000Z",
    nextRenewalAt: "2026-11-03T18:30:00.000Z",
    pendingPlan: null,
} as unknown as Subscription;

const GOLD = { id: "pl_gold", name: "Gold monthly" } as unknown as Plan;

const closeStep = vi.fn();

function Harness() {
    const { switchTo, rateStep, busy } = useSubscriptionActions(
        SUB,
        [GOLD],
        new Date("2026-10-12T06:30:00.000Z"),
        closeStep,
    );
    return (
        <>
            <button type="button" onClick={() => switchTo("pl_gold")}>
                Change plan
            </button>
            <output>{busy ? "busy" : "idle"}</output>
            {rateStep}
        </>
    );
}

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    for (const fn of [
        saveGstRates,
        refresh,
        closeStep,
        ...Object.values(actions),
        ...Object.values(toast),
    ]) {
        fn.mockReset();
    }
    saveGstRates.mockResolvedValue({ ok: true, data: { saved: 1 } });
    act(() => root.render(<Harness />));
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
    document.body.innerHTML = "";
});

async function settle() {
    for (let i = 0; i < 6; i++) {
        await act(async () => {
            await new Promise((r) => setTimeout(r, 0));
        });
    }
}

async function press(name: string) {
    const hit = Array.from(document.querySelectorAll("button")).find(
        (b) => b.textContent.trim() === name,
    );
    if (!hit) throw new Error(`No button ${name}`);
    await act(async () => {
        hit.click();
        await Promise.resolve();
    });
    await settle();
}

function choose(rate: string) {
    pickRate(ratePicker("GST rate for Gold monthly"), rate);
}

const sheet = () => document.querySelector<HTMLElement>('[role="dialog"]');

const REFUSED = {
    ok: false,
    error: "Gold monthly has no GST rate.",
    rates: [{ kind: "PLAN", id: "pl_gold", name: "Gold monthly" }],
};

describe("a plan change onto a plan with no GST rate", () => {
    it("asks for the rate in place, saves it on the plan, and books the change", async () => {
        actions.changePlan
            .mockResolvedValueOnce(REFUSED)
            .mockResolvedValueOnce({ ok: true, data: SUB });
        await press("Change plan");

        expect(sheet()?.textContent).toContain(
            "Gold monthly has no GST rate. Choose one to move them to this plan.",
        );
        expect(sheet()?.textContent).toContain(
            "Members already on this plan carry its rate from their next renewal.",
        );
        // A rate being asked for is not a failure.
        expect(toast.showError).not.toHaveBeenCalled();

        choose("18");
        await press("Save and change plan");

        expect(saveGstRates).toHaveBeenCalledWith([
            { kind: "PLAN", id: "pl_gold", rate: "18" },
        ]);
        expect(actions.changePlan).toHaveBeenCalledTimes(2);
        expect(actions.changePlan).toHaveBeenLastCalledWith("sub_1", "pl_gold");
        expect(closeStep).toHaveBeenCalled();
        expect(toast.showUndo).toHaveBeenCalledWith(
            expect.stringContaining("Switches to Gold monthly"),
            expect.any(Function),
        );
        expect(sheet()).toBeNull();
    });

    it("books nothing and says nothing when the sheet is closed", async () => {
        actions.changePlan.mockResolvedValue(REFUSED);
        await press("Change plan");
        await press("Cancel");

        expect(actions.changePlan).toHaveBeenCalledTimes(1);
        expect(saveGstRates).not.toHaveBeenCalled();
        expect(toast.showError).not.toHaveBeenCalled();
        expect(toast.showUndo).not.toHaveBeenCalled();
        expect(closeStep).not.toHaveBeenCalled();
        // Nothing is left waiting.
        expect(host.querySelector("output")?.textContent).toBe("idle");
    });

    it("still says any other refusal as it always did", async () => {
        actions.changePlan.mockResolvedValue({
            ok: false,
            error: "That plan is archived.",
        });
        await press("Change plan");
        expect(sheet()).toBeNull();
        expect(toast.showError).toHaveBeenCalledWith("That plan is archived.");
    });
});

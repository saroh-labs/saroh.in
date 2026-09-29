// @vitest-environment jsdom
/**
 * "When autopay charges" (round-2 D13B): three radio cards on the Plans tab,
 * each with its line and timeline, saved when picked; hidden when autopay
 * can't charge for the business; read-only without `subscription:write`.
 * Plan Detail's own choice defaults to the business's.
 *
 * `react-dom/client` + `act` directly, as the editor's tests do.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AutopayTimingSettings } from "@/lib/subscriptions/autopay-timing";
import type { SubscriptionSettings } from "@/lib/subscriptions/service";

import { AutopayTimingSetting } from "./autopay-timing-setting";
import { PlanAutopayTiming } from "./plan-detail/plan-autopay-timing";
import { PlansTab } from "./plans-tab";

const actions = vi.hoisted(() => ({
    setAutopayChargeTiming: vi.fn(),
    setPlanChargeTiming: vi.fn(),
    setMembersCanPause: vi.fn(),
    setPlanArchived: vi.fn(),
}));
vi.mock("@/lib/subscriptions/actions", () => actions);
vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@saroh/ui/toast", () => ({
    showError: vi.fn(),
    showSuccess: vi.fn(),
    showUndo: vi.fn(),
    dismissToasts: vi.fn(),
}));

const NOW = "2026-09-29T10:00:00Z";

const autopay = (
    over: Partial<AutopayTimingSettings> = {},
): AutopayTimingSettings => ({
    available: true,
    chargeTiming: "DAY_AFTER_RENEWAL",
    leadDays: 2,
    noticeHours: 26,
    dueDays: 7,
    ...over,
});

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    actions.setAutopayChargeTiming.mockResolvedValue({ ok: true, data: {} });
    actions.setPlanChargeTiming.mockResolvedValue({ ok: true, data: {} });
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.clearAllMocks();
});

/** Do it, then let the save's transition run. */
async function settle(fn: () => void) {
    act(fn);
    await act(() => Promise.resolve());
}

const radios = () =>
    Array.from(host.querySelectorAll<HTMLInputElement>('input[type="radio"]'));

function cardOf(input: HTMLInputElement): HTMLElement {
    const label = input.closest("label");
    if (!label) throw new Error("no card");
    return label;
}

describe("When autopay charges, for the business", () => {
    it("shows three radio cards with their line and timeline, the setting checked", () => {
        act(() =>
            root.render(
                <AutopayTimingSetting
                    settings={autopay()}
                    canWrite
                    nowIso={NOW}
                />,
            ),
        );
        expect(host.querySelector("legend")?.textContent).toBe(
            "When autopay charges",
        );
        const all = radios();
        expect(all.map((r) => r.value)).toEqual([
            "ON_RENEWAL_DATE",
            "DAY_AFTER_RENEWAL",
            "ON_DUE_DATE",
        ]);
        expect(all.map((r) => r.checked)).toEqual([false, true, false]);
        const first = cardOf(all[0]);
        expect(first.textContent).toContain("Charge on the renewal date");
        expect(first.className).toContain("cursor-pointer");
        expect(first.className).toContain("has-[:focus-visible]:ring-2");
        // A renewal a week out: 6 Oct.
        expect(first.textContent).toContain("Invoice + bank notice 4 Oct");
        expect(first.textContent).toContain("Charged 6 Oct");
        // The screen reader hears the line and the timeline.
        const described = (all[0].getAttribute("aria-describedby") ?? "")
            .split(" ")
            .map((id) => document.getElementById(id)?.textContent)
            .join(" ");
        expect(described).toContain("The money comes in on the renewal date");
        expect(described).toContain(
            "For example: Invoice + bank notice 4 Oct → charged 6 Oct (renewal).",
        );
        expect(cardOf(all[1]).textContent).toContain("Default");
    });

    it("saves the one picked", async () => {
        act(() =>
            root.render(
                <AutopayTimingSetting
                    settings={autopay()}
                    canWrite
                    nowIso={NOW}
                />,
            ),
        );
        await settle(() => {
            radios()[2].click();
        });
        expect(actions.setAutopayChargeTiming).toHaveBeenCalledWith(
            "ON_DUE_DATE",
        );
        expect(radios()[2].checked).toBe(true);
    });

    it("can't be changed without the capability", () => {
        act(() =>
            root.render(
                <AutopayTimingSetting
                    settings={autopay()}
                    canWrite={false}
                    nowIso={NOW}
                />,
            ),
        );
        expect(radios().every((r) => r.disabled)).toBe(true);
        expect(host.textContent).toContain(
            "Only someone who can change subscriptions can change this.",
        );
    });
});

describe("the Plans tab", () => {
    const settings = (
        a: AutopayTimingSettings | null,
    ): SubscriptionSettings => ({
        membersCanPause: true,
        accountArea: false,
        autopay: a,
    });
    const tab = (s: SubscriptionSettings) =>
        act(() =>
            root.render(
                <PlansTab
                    plans={[]}
                    canWrite
                    showClasses={false}
                    settings={s}
                    nowIso={NOW}
                />,
            ),
        );

    it("shows the setting where autopay can charge", () => {
        tab(settings(autopay()));
        expect(host.textContent).toContain("When autopay charges");
        expect(radios()).toHaveLength(3);
    });

    it("hides it where it can't, or from an older API", () => {
        tab(settings(autopay({ available: false })));
        expect(host.textContent).not.toContain("When autopay charges");
        tab(settings(null));
        expect(host.textContent).not.toContain("When autopay charges");
    });
});

describe("a plan's own choice", () => {
    it("follows the business until picked, then saves the plan's", async () => {
        act(() =>
            root.render(
                <PlanAutopayTiming
                    planId="plan_1"
                    planTiming={null}
                    settings={autopay({ chargeTiming: "ON_DUE_DATE" })}
                    canWrite
                    nowIso={NOW}
                />,
            ),
        );
        const select = host.querySelector("select");
        if (!select) throw new Error("no select");
        expect(select.value).toBe("BUSINESS");
        expect(select.options[0].textContent).toBe(
            "Use the business setting (Charge on the due date)",
        );
        expect(host.textContent).toContain(
            "For example: Invoice 6 Oct (renewal) → bank notice 11 Oct → charged 13 Oct (due date).",
        );
        await settle(() => {
            select.value = "ON_RENEWAL_DATE";
            select.dispatchEvent(new Event("change", { bubbles: true }));
        });
        expect(actions.setPlanChargeTiming).toHaveBeenCalledWith(
            "plan_1",
            "ON_RENEWAL_DATE",
        );
        await settle(() => {
            select.value = "BUSINESS";
            select.dispatchEvent(new Event("change", { bubbles: true }));
        });
        expect(actions.setPlanChargeTiming).toHaveBeenLastCalledWith(
            "plan_1",
            null,
        );
    });
});

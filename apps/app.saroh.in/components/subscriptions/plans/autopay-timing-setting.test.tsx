// @vitest-environment jsdom
/**
 * "When autopay charges" (round-2 D13B): three radio cards, each with its
 * line and timeline. Since the Subscriptions audit (12 Oct 2026) the cards
 * sit in the setting's sheet, which saves on Save with a toast and Undo,
 * and the Plans tab reads the saved choice as a row under the list. The
 * row is hidden when autopay can't charge for the business, and has no
 * Edit without `subscription:write`. Plan Detail's own choice defaults to
 * the business's.
 *
 * `react-dom/client` + `act` directly, as the editor's tests do.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
    AutopayChargeTiming,
    AutopayTimingSettings,
} from "@/lib/subscriptions/autopay-timing";
import type { SubscriptionSettings } from "@/lib/subscriptions/service";

import { PlanAutopayTiming } from "@/components/subscriptions/plan-detail/plan-autopay-timing";
import { AutopayTimingSetting } from "./autopay-timing-setting";
import { PlanSettings } from "./plan-settings";
import { PlansTab } from "./plans-tab";

const actions = vi.hoisted(() => ({
    setAutopayChargeTiming: vi.fn(),
    setPlanChargeTiming: vi.fn(),
    setMembersCanPause: vi.fn(),
    setPlanArchived: vi.fn(),
}));
vi.mock("@saroh/ui/option-select", () => ({
    OptionSelect: ({
        id,
        value,
        onValueChange,
        options,
        disabled,
        readOnly,
        ...aria
    }: {
        id?: string;
        value: string;
        onValueChange: (v: string) => void;
        options: { value: string; label: string }[];
        disabled?: boolean;
        readOnly?: boolean;
        "aria-label"?: string;
    }) => (
        <select
            id={id}
            aria-label={aria["aria-label"]}
            value={value}
            disabled={Boolean(disabled) || Boolean(readOnly)}
            onChange={(e) => onValueChange(e.target.value)}
        >
            {options.map((o) => (
                <option key={o.value} value={o.value}>
                    {o.label}
                </option>
            ))}
        </select>
    ),
}));
vi.mock("@/lib/subscriptions/actions", () => actions);
// The notice's and the rate step's Server Actions reach the API.
vi.mock("@/lib/gst-rates/actions", () => ({
    saveGstRates: vi.fn(),
    loadMissingRates: vi.fn(),
}));
const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh }),
    // `runAction` passes Next's own interrupts on; a plain failure is not one.
    unstable_rethrow: () => undefined,
}));
const toast = vi.hoisted(() => ({
    showError: vi.fn(),
    showSuccess: vi.fn(),
    showUndo: vi.fn(),
    dismissToasts: vi.fn(),
}));
vi.mock("@saroh/ui/toast", () => toast);

const NOW = "2026-09-29T10:00:00Z";
const SAVED =
    "Timing saved. Renewals from now on charge this way. Charges already on their way keep their date.";

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

const settings = (a: AutopayTimingSettings | null): SubscriptionSettings => ({
    membersCanPause: true,
    accountArea: false,
    autopay: a,
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

async function press(el: HTMLElement | null | undefined) {
    if (!el) throw new Error("Nothing to press");
    await act(async () => {
        el.click();
        await new Promise((r) => setTimeout(r, 20));
    });
}

/** The cards wherever they are drawn: on the page, or in the open sheet. */
const radios = (within: ParentNode = document.body) =>
    Array.from(
        within.querySelectorAll<HTMLInputElement>('input[type="radio"]'),
    );
const sheet = () => document.body.querySelector<HTMLElement>("[role=dialog]");
function button(name: string, within: ParentNode | null = host) {
    const hit = Array.from(within?.querySelectorAll("button") ?? []).find(
        (b) =>
            b.textContent.trim() === name ||
            b.getAttribute("aria-label") === name,
    );
    if (!hit) throw new Error(`No "${name}" button`);
    return hit;
}
const row = () => host.querySelector('[data-setting="timing"]')?.textContent;

function cardOf(input: HTMLInputElement): HTMLElement {
    const label = input.closest("label");
    if (!label) throw new Error("no card");
    return label;
}

describe("When autopay charges: the three cards", () => {
    const picked = vi.fn();
    const cards = (value: AutopayChargeTiming, disabled = false) =>
        act(() =>
            root.render(
                <AutopayTimingSetting
                    settings={autopay()}
                    value={value}
                    onChange={picked}
                    disabled={disabled}
                    nowIso={NOW}
                />,
            ),
        );

    it("shows three radio cards with their line and timeline, the setting checked", () => {
        cards("DAY_AFTER_RENEWAL");
        expect(host.querySelector("legend")?.textContent).toBe(
            "When autopay charges",
        );
        const all = radios(host);
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
        expect(host.textContent).toContain(
            "The bank tells them 26 hours before it takes the money.",
        );
    });

    it("only chooses: a pick is handed up, and nothing is saved", () => {
        cards("DAY_AFTER_RENEWAL");
        act(() => radios(host)[2].click());
        expect(picked).toHaveBeenCalledWith("ON_DUE_DATE");
        expect(actions.setAutopayChargeTiming).not.toHaveBeenCalled();
    });

    it("can't be picked while a save is on its way", () => {
        cards("DAY_AFTER_RENEWAL", true);
        expect(radios(host).every((r) => r.disabled)).toBe(true);
    });
});

describe("When autopay charges: the row and its sheet", () => {
    const draw = (canWrite = true, a = autopay()) =>
        act(() =>
            root.render(
                <PlanSettings
                    settings={settings(a)}
                    canWrite={canWrite}
                    nowIso={NOW}
                />,
            ),
        );

    it("reads the saved choice in a sentence, with Edit", () => {
        draw();
        expect(row()).toBe("Autopay charges the day after renewal.");
        expect(button("Edit: When autopay charges")).toBeTruthy();
        // Nothing to scroll past: the cards are in the sheet.
        expect(radios()).toHaveLength(0);
        draw(true, autopay({ chargeTiming: "ON_DUE_DATE" }));
        expect(row()).toBe("Autopay charges on the due date.");
        draw(true, autopay({ chargeTiming: "ON_RENEWAL_DATE" }));
        expect(row()).toBe("Autopay charges on the renewal date.");
    });

    it("Edit opens the sheet with the three cards and their worked examples", async () => {
        draw();
        await press(button("Edit: When autopay charges"));
        expect(sheet()?.textContent).toContain("When autopay charges");
        const all = radios(sheet() ?? undefined);
        expect(all.map((r) => r.checked)).toEqual([false, true, false]);
        expect(cardOf(all[0]).textContent).toContain(
            "Invoice + bank notice 4 Oct",
        );
        expect(cardOf(all[2]).textContent).toContain(
            "No time to try again before it's overdue.",
        );
    });

    it("saves on Save, not on a pick, with a toast and Undo", async () => {
        draw();
        await press(button("Edit: When autopay charges"));
        await press(radios(sheet() ?? undefined)[2]);
        // Choosing is not saving.
        expect(actions.setAutopayChargeTiming).not.toHaveBeenCalled();
        expect(row()).toBe("Autopay charges the day after renewal.");

        await press(button("Save", sheet()));
        expect(actions.setAutopayChargeTiming).toHaveBeenCalledWith(
            "ON_DUE_DATE",
        );
        // The row reads the save at once, and the page is read again.
        expect(row()).toBe("Autopay charges on the due date.");
        expect(refresh).toHaveBeenCalled();
        const [said, undo] = toast.showUndo.mock.calls[0] as [
            string,
            () => Promise<unknown>,
        ];
        expect(said).toBe(SAVED);

        // Undo puts back what it was.
        await act(async () => {
            await expect(undo()).resolves.toEqual({ ok: true });
        });
        expect(actions.setAutopayChargeTiming).toHaveBeenLastCalledWith(
            "DAY_AFTER_RENEWAL",
        );
        expect(row()).toBe("Autopay charges the day after renewal.");
    });

    it("a refusal says why and keeps the sheet open with what was picked", async () => {
        actions.setAutopayChargeTiming.mockResolvedValue({
            ok: false,
            error: "Couldn't save when autopay charges. Try again.",
        });
        draw();
        await press(button("Edit: When autopay charges"));
        await press(radios(sheet() ?? undefined)[0]);
        await press(button("Save", sheet()));
        expect(toast.showError).toHaveBeenCalledWith(
            "Couldn't save when autopay charges. Try again.",
        );
        expect(toast.showUndo).not.toHaveBeenCalled();
        expect(radios(sheet() ?? undefined)[0].checked).toBe(true);
        expect(row()).toBe("Autopay charges the day after renewal.");
    });

    it("can't be changed without the capability: the row reads, with no Edit", () => {
        draw(false);
        expect(row()).toBe("Autopay charges the day after renewal.");
        expect(host.querySelectorAll("button")).toHaveLength(0);
        expect(host.textContent).toContain(
            "Only someone who can change subscriptions can change these.",
        );
    });
});

describe("the Plans tab", () => {
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
        expect(row()).toBe("Autopay charges the day after renewal.");
    });

    it("hides it where it can't, or from an older API", () => {
        tab(settings(autopay({ available: false })));
        expect(host.textContent).not.toContain("When autopay charges");
        tab(settings(null));
        expect(host.textContent).not.toContain("When autopay charges");
        // With neither setting to show, the group is not drawn at all.
        expect(host.textContent).not.toContain("Settings for every plan");
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

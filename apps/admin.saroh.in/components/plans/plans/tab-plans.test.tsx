/** @vitest-environment jsdom */
import type { Catalog } from "@saroh/pricing-catalog";
import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
    within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AUTOSAVE_MS } from "../draft-store";
import type { PlansData } from "../plans-context";
import { PlansShell } from "../plans-shell";
import { tabData } from "./tab-test-kit";

const actions = vi.hoisted(() => ({
    savePricingDraftAction: vi.fn(),
    discardPricingDraftAction: vi.fn(),
    previewPricingAction: vi.fn(),
    pricingImpactAction: vi.fn(),
}));
vi.mock("@/lib/pricing-actions", () => actions);
vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
}));

function open(data: PlansData = tabData()) {
    return render(<PlansShell data={data} impact={null} tab="plans" />);
}

/** What the last autosave sent. */
async function saved(): Promise<Catalog> {
    await act(() => vi.advanceTimersByTimeAsync(AUTOSAVE_MS));
    const call = actions.savePricingDraftAction.mock.calls.at(-1);
    if (!call) throw new Error("nothing was saved");
    return (call[0] as { catalog: Catalog }).catalog;
}

const editor = () => screen.getByRole("region", { name: "Plan by plan" });
const chip = (name: RegExp) =>
    within(screen.getByRole("group", { name: "Plans" })).getByRole("button", {
        name,
    });
const row = (name: string) => {
    const el = editor().querySelector<HTMLElement>(`[data-module="${name}"]`);
    if (!el) throw new Error(`no row ${name}`);
    return within(el);
};

beforeEach(() => {
    vi.useFakeTimers();
    Element.prototype.scrollIntoView = vi.fn();
    actions.pricingImpactAction.mockResolvedValue({ ok: true, data: null });
    actions.savePricingDraftAction.mockResolvedValue({
        ok: true,
        data: { revision: 1, valid: true, errors: [], changes: [] },
    });
    window.history.replaceState(null, "", "/plans");
});
afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.clearAllMocks();
});

describe("Plan by plan", () => {
    it("opens on the highlighted plan with its fields and count", () => {
        open();
        expect(chip(/^Plan B/).getAttribute("aria-pressed")).toBe("true");
        expect(screen.getByLabelText("Name")).toHaveProperty("value", "Plan B");
        expect(
            screen.getByLabelText("Price a month, before GST (₹)"),
        ).toHaveProperty("value", "111");
        expect(screen.getByLabelText("Button")).toHaveProperty(
            "value",
            "Try B",
        );
        expect(
            screen.getByText("1 business on Plan B · 1 on an older version"),
        ).toBeTruthy();
        expect(
            screen.getByRole("button", { name: "Remove highlight" }),
        ).toBeTruthy();
        // Yearly is on: pay for 10 months.
        expect(screen.getByText(/Yearly:.*a year/).textContent).toContain(
            "1,110",
        );
        // Grouped rows, with each group's label.
        expect(within(editor()).getByText("Group one")).toBeTruthy();
        expect(within(editor()).getByText("Group two")).toBeTruthy();
    });

    it("ticks a module on with the default words, marks it changed and saves it", async () => {
        open();
        fireEvent.click(chip(/^Plan A/));
        expect(row("widgets").queryByLabelText("Comparison table")).toBeNull();
        expect(row("widgets").queryByText("Changed")).toBeNull();

        fireEvent.click(
            row("widgets").getByRole("checkbox", { name: /Widgets/ }),
        );

        expect(
            row("widgets").getByLabelText("Comparison table"),
        ).toHaveProperty("value", "Included");
        expect(row("widgets").getByText("Changed")).toBeTruthy();
        expect(
            chip(/^Plan A/).querySelector('[aria-label="Changed"]'),
        ).toBeTruthy();

        const c = await saved();
        expect(c.modules.find((m) => m.id === "widgets")?.cells.a).toEqual({
            inc: true,
            text: "Included",
            card: "",
            limit: null,
            per: "",
        });
    });

    it("keeps live's words when a module is ticked off and on again", () => {
        open();
        const tick = () =>
            row("things").getByRole("checkbox", { name: /Things/ });
        fireEvent.click(tick());
        expect(row("things").getByText("In the dashboard:")).toBeTruthy();
        fireEvent.click(tick());
        expect(row("things").getByLabelText("Comparison table")).toHaveProperty(
            "value",
            "111",
        );
        expect(row("things").queryByText("Changed")).toBeNull();
    });

    it("switches an excluded module between Locked and Hidden", async () => {
        open();
        fireEvent.click(chip(/^Plan A/));
        const locked = row("widgets").getByRole("radio", {
            name: "Locked for Widgets",
        });
        expect(
            row("widgets").getByText("Not in the menu at all."),
        ).toBeTruthy();
        fireEvent.click(locked);
        expect(
            row("widgets").getByText(
                "In the menu with a lock and an upgrade panel.",
            ),
        ).toBeTruthy();
        const c = await saved();
        expect(c.modules.find((m) => m.id === "widgets")?.cells.a).toEqual({
            inc: false,
            off: "locked",
        });
    });

    it("highlights one plan at most", async () => {
        open();
        fireEvent.click(chip(/^Plan C/));
        fireEvent.click(
            screen.getByRole("button", { name: "Highlight this card" }),
        );
        expect(
            screen.getByRole("button", { name: "Remove highlight" }),
        ).toBeTruthy();
        fireEvent.click(chip(/^Plan B/));
        expect(
            screen.getByRole("button", { name: "Highlight this card" }),
        ).toBeTruthy();
        const c = await saved();
        expect(c.plans.filter((p) => p.featured).map((p) => p.id)).toEqual([
            "c",
        ]);
    });

    it("retires a plan, dims its chip, and offers it again", () => {
        open();
        fireEvent.click(screen.getByRole("button", { name: "Retire plan" }));
        expect(chip(/^Plan B/).className).toContain("opacity-60");
        expect(chip(/^Plan B/).textContent).toContain("(retired)");
        expect(
            screen.getByText("Retired: not on the pricing page"),
        ).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Offer again" }));
        expect(chip(/^Plan B/).className).not.toContain("opacity-60");
        expect(
            screen.queryByText("Retired: not on the pricing page"),
        ).toBeNull();
    });

    it("adds a plan with the design's defaults and selects it", async () => {
        open();
        fireEvent.click(screen.getByRole("button", { name: "Plan" }));
        expect(chip(/^New plan/).getAttribute("aria-pressed")).toBe("true");
        expect(screen.getByLabelText("Button")).toHaveProperty(
            "value",
            "Choose plan",
        );
        expect(screen.getByText("0 businesses on New plan")).toBeTruthy();
        const c = await saved();
        expect(c.plans.at(-1)).toMatchObject({
            name: "New plan",
            pricePaise: 0,
            cta: "Choose plan",
            featured: false,
            retired: false,
        });
        expect(c.plans.at(-1)?.id).toMatch(/^p[a-z0-9]+$/);
    });

    it("stores the price in paise, and refuses a minus or letters", async () => {
        open();
        const price = screen.getByLabelText("Price a month, before GST (₹)");

        fireEvent.change(price, { target: { value: "-5" } });
        expect(price.getAttribute("aria-invalid")).toBe("true");
        expect(
            screen.getByText("Enter rupees, like 499 or 499.50"),
        ).toBeTruthy();
        fireEvent.change(price, { target: { value: "12a" } });
        expect(price).toHaveProperty("value", "12a");
        await act(() => vi.advanceTimersByTimeAsync(AUTOSAVE_MS));
        expect(actions.savePricingDraftAction).not.toHaveBeenCalled();

        fireEvent.change(price, { target: { value: "333.5" } });
        expect(price.getAttribute("aria-invalid")).toBe("false");
        const c = await saved();
        expect(c.plans.find((p) => p.id === "b")?.pricePaise).toBe(33_350);
        expect(chip(/^Plan B/).textContent).toContain("333.50");
    });

    it("takes a limit as a whole number above 0, blank for none", async () => {
        open();
        const limit = row("things").getByLabelText("Limit (blank: none)");
        expect(limit).toHaveProperty("value", "111");

        fireEvent.change(limit, { target: { value: "0" } });
        expect(
            row("things").getByText(
                "A whole number above 0, or blank for no limit",
            ),
        ).toBeTruthy();
        fireEvent.change(limit, { target: { value: "2.5" } });
        await act(() => vi.advanceTimersByTimeAsync(AUTOSAVE_MS));
        expect(actions.savePricingDraftAction).not.toHaveBeenCalled();

        fireEvent.change(limit, { target: { value: "" } });
        fireEvent.change(row("things").getByLabelText("Counted"), {
            target: { value: "month" },
        });
        const c = await saved();
        expect(c.modules[0]?.cells.b).toMatchObject({
            limit: null,
            per: "month",
        });
    });

    it("recounts the usage line as the limit changes", () => {
        open();
        fireEvent.click(chip(/^Plan A/));
        expect(
            row("things").getByText("2 of 2 use it · highest 10 · 1 at 80%+"),
        ).toBeTruthy();
        fireEvent.change(row("things").getByLabelText("Limit (blank: none)"), {
            target: { value: "5" },
        });
        expect(
            row("things").getByText(
                "2 of 2 use it · highest 10 · 1 over the limit",
            ),
        ).toBeTruthy();
    });

    it("says what the catalogue refuses beside the field", () => {
        open();
        fireEvent.change(screen.getByLabelText("Name"), {
            target: { value: "" },
        });
        const name = screen.getByLabelText("Name");
        expect(name.getAttribute("aria-invalid")).toBe("true");
        const message = document.getElementById(
            name.getAttribute("aria-describedby") ?? "",
        );
        expect(message?.textContent).toBe("This can't be blank");
    });

    it("draws every field read-only without pricing:edit", () => {
        open(
            tabData({
                access: {
                    canEdit: false,
                    canPublish: false,
                    canManageCoupons: false,
                },
            }),
        );
        expect(screen.getByLabelText("Name")).toHaveProperty("disabled", true);
        expect(
            screen.getByLabelText("Price a month, before GST (₹)"),
        ).toHaveProperty("disabled", true);
        expect(
            row("things").getByRole("checkbox", { name: /Things/ }),
        ).toHaveProperty("disabled", true);
        expect(screen.getByRole("button", { name: "Plan" })).toHaveProperty(
            "disabled",
            true,
        );
        // Plans can still be looked through.
        fireEvent.click(chip(/^Plan C/));
        expect(screen.getByLabelText("Name")).toHaveProperty("value", "Plan C");
    });
});

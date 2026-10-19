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

const dialog = (name: string) => within(screen.getByRole("dialog", { name }));

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

/**
 * The Plans tab around its sheets (admin redesign U12): Add plan, and
 * taking back a plan that was never published. What the sheets do is
 * `sheets/sheets.test.tsx`; the table is `grid/pricing-grid.test.tsx`.
 */
describe("adding a plan", () => {
    it("adds a plan with the design's defaults and opens its sheet", async () => {
        open();
        fireEvent.click(screen.getByRole("button", { name: "Add plan" }));
        const sheet = dialog("Edit New plan");
        expect(sheet.getByLabelText("Button")).toHaveProperty(
            "value",
            "Choose plan",
        );
        expect(sheet.getByText("0 businesses on New plan")).toBeTruthy();
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

    it("offers no Add plan without pricing:edit", () => {
        open(
            tabData({
                access: {
                    canEdit: false,
                    canPublish: false,
                    canManageCoupons: false,
                },
            }),
        );
        expect(screen.queryByRole("button", { name: "Add plan" })).toBeNull();
    });
});

describe("taking back a new plan", () => {
    it("removes a plan that was never published, and Undo brings its sheet back", async () => {
        open();
        fireEvent.click(screen.getByRole("button", { name: "Add plan" }));
        fireEvent.click(
            dialog("Edit New plan").getByRole("button", {
                name: "Remove plan",
            }),
        );
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(screen.getByRole("status").textContent).toContain(
            "New plan removed",
        );
        let c = await saved();
        expect(c.plans.map((p) => p.id)).toEqual(["a", "b", "c"]);
        fireEvent.click(screen.getByRole("button", { name: "Undo" }));
        expect(
            screen.getByRole("dialog", { name: "Edit New plan" }),
        ).toBeTruthy();
        c = await saved();
        expect(c.plans.map((p) => p.name)).toContain("New plan");
    });

    it("offers no Remove on a live plan (Retire is the way)", () => {
        open();
        fireEvent.click(
            screen.getByRole("button", { name: "Plan B's settings" }),
        );
        expect(
            dialog("Edit Plan B").queryByRole("button", {
                name: "Remove plan",
            }),
        ).toBeNull();
        expect(
            dialog("Edit Plan B").getByRole("button", {
                name: "Retire Plan B",
            }),
        ).toBeTruthy();
    });
});

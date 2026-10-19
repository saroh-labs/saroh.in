/** @vitest-environment jsdom */
import type { Catalog } from "@saroh/pricing-catalog";
import { SEARCH_DEBOUNCE_MS } from "@saroh/ui/list-search";
import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
    within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fakePricing, RAVI } from "@/test/pricing-fixture";

import { AUTOSAVE_MS } from "../draft-store";
import type { PlansData } from "../plans-context";
import { PlansShell } from "../plans-shell";
import { tabData } from "../plans/tab-test-kit";

/**
 * The Plans grid (admin redesign U11), on the made-up catalogue of
 * `tab-test-kit` (Plan A/B/C; Things capped at 11 / 111 (soft) / none;
 * Widgets off on Plan A; Gadgets off on Plan A; Doodads only on Plan C),
 * inside the real shell, so autosave, a 409 and the toast are the store's.
 */

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
const readOnly = () =>
    tabData({
        access: { canEdit: false, canPublish: false, canManageCoupons: false },
    });

async function saved(): Promise<Catalog> {
    await act(() => vi.advanceTimersByTimeAsync(AUTOSAVE_MS));
    const call = actions.savePricingDraftAction.mock.calls.at(-1);
    if (!call) throw new Error("nothing was saved");
    return (call[0] as { catalog: Catalog }).catalog;
}
async function nothingSaved() {
    await act(() => vi.advanceTimersByTimeAsync(AUTOSAVE_MS * 2));
    expect(actions.savePricingDraftAction).not.toHaveBeenCalled();
}

const grid = () => screen.getByRole("grid");
const cell = (name: string) => {
    const el = grid().querySelector<HTMLElement>(`[data-cell="${name}"]`);
    if (!el) throw new Error(`no cell ${name}`);
    return el;
};
const head = (plan: string) => {
    const el = grid().querySelector<HTMLElement>(`[data-plan="${plan}"]`);
    if (!el) throw new Error(`no header ${plan}`);
    return el;
};
const key = (el: Element, k: string, init: KeyboardEventInit = {}) =>
    fireEvent.keyDown(el, { key: k, ...init });
const focused = (): Element => {
    const el = document.activeElement;
    if (!el) throw new Error("nothing is focused");
    return el;
};
/** The Plans tab's one-line confirmation (always mounted, empty when quiet). */
const toast = () =>
    document.querySelector('[role="status"][aria-live="polite"]');
const things = (c: Catalog, plan: string) =>
    c.modules.find((m) => m.id === "things")?.cells[plan];

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

describe("the grid's roles and names", () => {
    it("has plans across as column headers and features down as row headers, grouped", () => {
        open();
        const cols = within(grid())
            .getAllByRole("columnheader")
            .map((h) => h.textContent);
        expect(cols[0]).toBe("Feature");
        expect(cols.slice(1).map((t) => t.split("₹")[0])).toEqual([
            "Plan A",
            "Plan B",
            "Plan C",
        ]);
        expect(
            within(grid())
                .getAllByRole("rowheader")
                .map((h) => h.textContent),
        ).toEqual(["Things", "Widgets", "Gadgets", "Doodads"]);
        expect(
            within(grid()).getByRole("rowgroup", { name: "Group two" }),
        ).toBeTruthy();
    });

    it("names each cell by what it says", () => {
        open();
        expect(within(grid()).getByRole("gridcell", { name: "111" })).toBe(
            cell("Things on Plan B"),
        );
        expect(cell("Things on Plan C").getAttribute("aria-label")).toBe(
            "No limit",
        );
        expect(cell("Widgets on Plan A").getAttribute("aria-label")).toBe(
            "Not included",
        );
        expect(cell("Widgets on Plan B").getAttribute("aria-label")).toBe(
            "Included",
        );
        expect(cell("Widgets on Plan B").textContent).toBe("✓");
        expect(cell("Widgets on Plan A").textContent).toBe("—");
    });

    it("tints the highlighted plan's column", () => {
        open();
        expect(head("b").className).toContain("bg-highlight-subtle");
        expect(cell("Widgets on Plan B").className).toContain(
            "bg-highlight-subtle",
        );
        expect(cell("Widgets on Plan C").className).not.toContain(
            "bg-highlight-subtle",
        );
    });
});

describe("the keyboard", () => {
    it("keeps one cell in the tab order, so Tab leaves the grid in one stop", () => {
        open();
        const stops = Array.from(
            grid().querySelectorAll<HTMLElement>("[tabindex]"),
        ).filter((el) => el.tabIndex >= 0);
        expect(stops).toEqual([cell("Things on Plan A")]);
        // The price boxes and pencils aren't stops of their own.
        for (const el of grid().querySelectorAll<HTMLElement>("input, button"))
            expect(el.tabIndex).toBe(-1);
    });

    it("moves with the arrows, Home and End, onto the plans' headers too", () => {
        open();
        cell("Things on Plan A").focus();
        key(focused(), "ArrowRight");
        expect(focused()).toBe(cell("Things on Plan B"));
        key(focused(), "ArrowDown");
        expect(focused()).toBe(cell("Widgets on Plan B"));
        key(focused(), "End");
        expect(focused()).toBe(cell("Widgets on Plan C"));
        key(focused(), "ArrowRight");
        expect(focused()).toBe(cell("Widgets on Plan C"));
        key(focused(), "Home");
        expect(focused()).toBe(cell("Widgets on Plan A"));
        key(focused(), "ArrowUp");
        key(focused(), "ArrowUp");
        expect(focused()).toBe(head("a"));
        // The roving stop follows.
        expect(head("a").tabIndex).toBe(0);
        expect(cell("Things on Plan A").tabIndex).toBe(-1);
    });

    it("opens a cell with Enter, and Esc puts it back with the keyboard on the cell", async () => {
        open();
        const c = cell("Things on Plan B");
        c.focus();
        key(c, "Enter");
        const limit = screen.getByLabelText("Limit for Things on Plan B");
        expect(focused()).toBe(limit);
        expect(limit).toHaveProperty("value", "111");
        fireEvent.change(limit, { target: { value: "5" } });
        key(limit, "Escape");
        expect(
            screen.queryByLabelText("Limit for Things on Plan B"),
        ).toBeNull();
        expect(focused()).toBe(c);
        expect(c.getAttribute("aria-label")).toBe("111");
        await nothingSaved();
    });

    it("keeps arrows typed in an open cell to the cell", () => {
        open();
        const c = cell("Things on Plan B");
        c.focus();
        key(c, "Enter");
        const limit = screen.getByLabelText("Limit for Things on Plan B");
        key(limit, "ArrowRight");
        expect(focused()).toBe(limit);
    });
});

describe("a limit", () => {
    it("offers −/+ and No limit only while the cell is open", () => {
        open();
        expect(screen.queryByRole("button", { name: /^One more/ })).toBeNull();
        expect(screen.queryByRole("checkbox", { name: "No limit" })).toBeNull();
        fireEvent.click(cell("Things on Plan B"));
        expect(
            screen.getByRole("button", {
                name: "One more for Things on Plan B",
            }),
        ).toBeTruthy();
        expect(screen.getByRole("checkbox", { name: "No limit" })).toBeTruthy();
        expect(screen.getByText("Reaches 1 business at renewal")).toBeTruthy();
    });

    it("steps with −/+, commits on Done, says what it was, and returns the keyboard", async () => {
        open();
        const c = cell("Things on Plan B");
        fireEvent.click(c);
        const more = screen.getByRole("button", {
            name: "One more for Things on Plan B",
        });
        fireEvent.click(more);
        fireEvent.click(more);
        fireEvent.click(
            screen.getByRole("button", {
                name: "One less for Things on Plan B",
            }),
        );
        expect(
            screen.getByLabelText("Limit for Things on Plan B"),
        ).toHaveProperty("value", "112");
        fireEvent.click(screen.getByRole("button", { name: "Done" }));

        expect(focused()).toBe(c);
        expect(c.getAttribute("aria-label")).toBe("112, was 111");
        expect(c.textContent).toContain("was 111");
        expect(
            within(grid()).getByRole("gridcell", { name: "112, was 111" }),
        ).toBe(c);
        const sent = await saved();
        // The table's words followed the number; the soft cap stays.
        expect(things(sent, "b")).toMatchObject({
            limit: 112,
            text: "112",
            soft: true,
        });
        // No toast for a cell edit: its feedback is the cell's "was".
        expect(toast()?.textContent).toBe("");
    });

    it("takes the limit away with No limit, and Enter in the number is Done", async () => {
        open();
        const c = cell("Things on Plan A");
        c.focus();
        key(c, "Enter");
        fireEvent.click(screen.getByRole("checkbox", { name: "No limit" }));
        expect(
            screen.getByLabelText("Limit for Things on Plan A"),
        ).toHaveProperty("disabled", true);
        expect(
            screen.getByRole("button", {
                name: "One more for Things on Plan A",
            }),
        ).toHaveProperty("disabled", true);
        fireEvent.click(screen.getByRole("button", { name: "Done" }));
        expect(c.getAttribute("aria-label")).toBe("No limit, was 11");
        const sent = await saved();
        expect(things(sent, "a")).toMatchObject({
            limit: null,
            text: "No limit",
            // The card line was the operator's words around the number.
            card: "11 things",
            soft: false,
        });
    });

    it("refuses a limit that isn't a whole number above 0", async () => {
        open();
        const c = cell("Things on Plan B");
        c.focus();
        key(c, "Enter");
        const limit = screen.getByLabelText("Limit for Things on Plan B");
        fireEvent.change(limit, { target: { value: "0" } });
        key(limit, "Enter");
        expect(limit.getAttribute("aria-invalid")).toBe("true");
        expect(screen.getByText("A whole number above 0")).toBeTruthy();
        fireEvent.change(limit, { target: { value: "22" } });
        key(limit, "Enter");
        expect(focused()).toBe(c);
        expect(things(await saved(), "b")).toMatchObject({ limit: 22 });
    });
});

describe("a module", () => {
    it("turns Included on and off in place", async () => {
        open();
        const c = cell("Widgets on Plan A");
        c.focus();
        key(c, "Enter");
        const not = screen.getByRole("button", { name: "Not included" });
        expect(not.getAttribute("aria-pressed")).toBe("true");
        expect(focused()).toBe(not);
        fireEvent.click(screen.getByRole("button", { name: "Included" }));
        expect(focused()).toBe(c);
        expect(c.getAttribute("aria-label")).toBe("Included, was not included");
        let sent = await saved();
        expect(
            sent.modules.find((m) => m.id === "widgets")?.cells.a,
        ).toMatchObject({ inc: true, text: "Included" });

        const g = cell("Gadgets on Plan B");
        fireEvent.click(g);
        fireEvent.click(screen.getByRole("button", { name: "Not included" }));
        expect(g.getAttribute("aria-label")).toBe("Not included, was included");
        sent = await saved();
        expect(sent.modules.find((m) => m.id === "gadgets")?.cells.b).toEqual({
            inc: false,
            off: "locked",
        });
        expect(toast()?.textContent).toBe("");
    });

    it("changes nothing when the same choice is picked", async () => {
        open();
        fireEvent.click(cell("Widgets on Plan B"));
        fireEvent.click(screen.getByRole("button", { name: "Included" }));
        await nothingSaved();
    });
});

describe("search and filters", () => {
    const chip = (name: RegExp) =>
        within(screen.getByRole("group", { name: "Show" })).getByRole(
            "button",
            { name },
        );
    const rows = () =>
        within(grid())
            .queryAllByRole("rowheader")
            .map((h) => h.textContent);

    it("shows only the changed rows under Changed, with its count", () => {
        open();
        expect(chip(/^Changed/).textContent).toBe("Changed0");
        fireEvent.click(cell("Widgets on Plan A"));
        fireEvent.click(screen.getByRole("button", { name: "Included" }));
        expect(chip(/^Changed/).textContent).toBe("Changed1");
        fireEvent.click(chip(/^Changed/));
        expect(chip(/^Changed/).getAttribute("aria-pressed")).toBe("true");
        expect(rows()).toEqual(["Widgets"]);
        fireEvent.click(chip(/^Limits/));
        expect(rows()).toEqual(["Things"]);
        fireEvent.click(chip(/^Modules/));
        expect(rows()).toEqual(["Widgets", "Gadgets", "Doodads"]);
    });

    it("says when nothing is changed yet", () => {
        open();
        fireEvent.click(chip(/^Changed/));
        expect(rows()).toEqual([]);
        expect(
            screen.getByText("Nothing here differs from the live version yet."),
        ).toBeTruthy();
        fireEvent.click(
            screen.getByRole("button", { name: "Show all features" }),
        );
        expect(rows()).toHaveLength(4);
    });

    it('focuses the search with "/" and finds a feature by name', async () => {
        open();
        cell("Things on Plan A").focus();
        key(focused(), "/");
        const search = screen.getByRole("searchbox", {
            name: "Search features",
        });
        expect(focused()).toBe(search);
        fireEvent.change(search, { target: { value: "gad" } });
        await act(() => vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS));
        expect(rows()).toEqual(["Gadgets"]);
    });
});

describe("a plan's price box", () => {
    const price = (plan: string) =>
        screen.getByLabelText(`${plan}'s price a month, before GST, in rupees`);

    it("refuses what isn't rupees, and keeps a price on Enter", async () => {
        open();
        const box = price("Plan B");
        expect(box).toHaveProperty("value", "111");
        fireEvent.change(box, { target: { value: "-5" } });
        key(box, "Enter");
        expect(box.getAttribute("aria-invalid")).toBe("true");
        expect(
            within(head("b")).getByText("Enter rupees, like 499 or 499.50"),
        ).toBeTruthy();
        fireEvent.change(box, { target: { value: "12a" } });
        fireEvent.blur(box);
        await nothingSaved();

        fireEvent.change(box, { target: { value: "333.5" } });
        key(box, "Enter");
        expect(focused()).toBe(head("b"));
        expect(within(head("b")).getByText("was ₹111")).toBeTruthy();
        const sent = await saved();
        expect(sent.plans.find((p) => p.id === "b")?.pricePaise).toBe(33_350);
    });

    it("opens from its header with Enter, and Esc puts the price back", async () => {
        open();
        head("c").focus();
        key(head("c"), "Enter");
        const box = price("Plan C");
        expect(focused()).toBe(box);
        fireEvent.change(box, { target: { value: "1" } });
        key(box, "Escape");
        expect(box).toHaveProperty("value", "222");
        expect(focused()).toBe(head("c"));
        await nothingSaved();
    });

    it("opens the plan's settings from its pencil", () => {
        open();
        fireEvent.click(
            screen.getByRole("button", { name: "Plan C's settings" }),
        );
        expect(
            screen.getByRole("dialog", { name: "Edit Plan C" }),
        ).toBeTruthy();
    });

    it("opens a feature on every plan from its name", () => {
        open();
        fireEvent.click(
            within(grid()).getByRole("rowheader", { name: "Gadgets" }),
        );
        expect(screen.getByRole("dialog", { name: "Gadgets" })).toBeTruthy();
    });
});

describe("without pricing:edit", () => {
    it("reads the same and opens nothing", async () => {
        open(readOnly());
        expect(grid().getAttribute("aria-readonly")).toBe("true");
        const c = cell("Things on Plan B");
        c.focus();
        key(c, "Enter");
        fireEvent.click(c);
        expect(screen.queryByRole("button", { name: "Done" })).toBeNull();
        expect(
            screen.queryByLabelText("Limit for Things on Plan B"),
        ).toBeNull();
        // Still moves.
        key(c, "ArrowRight");
        expect(focused()).toBe(cell("Things on Plan C"));
        const box = screen.getByLabelText(
            "Plan B's price a month, before GST, in rupees",
        );
        expect(box).toHaveProperty("readOnly", true);
        await nothingSaved();
    });
});

describe("the draft's own rules", () => {
    it("shows the first-run start, not an empty grid, with nothing published", () => {
        open(
            tabData({
                pricing: fakePricing({
                    liveVersion: null,
                    versions: [],
                    draft: null,
                }),
            }),
        );
        expect(screen.getByText("No pricing yet")).toBeTruthy();
        expect(screen.queryByRole("grid")).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Start blank" }));
        expect(screen.getByRole("grid")).toBeTruthy();
    });

    it("stops at a 409 and offers Reload", async () => {
        actions.savePricingDraftAction.mockResolvedValue({
            ok: false,
            status: 409,
            error: "Ravi saved the draft since.",
            details: { revision: 5, updatedBy: RAVI, updatedAt: null },
        });
        open();
        fireEvent.click(cell("Widgets on Plan A"));
        fireEvent.click(screen.getByRole("button", { name: "Included" }));
        await act(() => vi.advanceTimersByTimeAsync(AUTOSAVE_MS));
        expect(screen.getByRole("button", { name: /^Reload/ })).toBeTruthy();
        // Nothing more is saved over Ravi's work, and nothing is toasted.
        fireEvent.click(cell("Gadgets on Plan B"));
        fireEvent.click(screen.getByRole("button", { name: "Not included" }));
        await act(() => vi.advanceTimersByTimeAsync(AUTOSAVE_MS * 2));
        expect(actions.savePricingDraftAction).toHaveBeenCalledTimes(1);
        expect(toast()?.textContent).toBe("");
    });
});

/** @vitest-environment jsdom */
import type { Catalog } from "@saroh/pricing-catalog";
import { cardLines } from "@saroh/pricing-catalog";
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
import { tabData } from "../plans/tab-test-kit";

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
    return render(<PlansShell data={data} impact={null} tab="modules" />);
}

async function saved(): Promise<Catalog> {
    await act(() => vi.advanceTimersByTimeAsync(AUTOSAVE_MS));
    const call = actions.savePricingDraftAction.mock.calls.at(-1);
    if (!call) throw new Error("nothing was saved");
    return (call[0] as { catalog: Catalog }).catalog;
}

const matrix = () => within(screen.getByRole("table"));
/** The module names down the matrix, top to bottom. */
const moduleNames = () =>
    Array.from(
        screen
            .getByRole("table")
            .querySelectorAll("tbody td:first-child > button"),
    ).map((b) => b.textContent);
const nameButton = (name: RegExp) =>
    matrix().getByRole("button", { name, expanded: false });

beforeEach(() => {
    vi.useFakeTimers();
    Element.prototype.scrollIntoView = vi.fn();
    actions.pricingImpactAction.mockResolvedValue({ ok: true, data: null });
    actions.savePricingDraftAction.mockResolvedValue({
        ok: true,
        data: { revision: 1, valid: true, errors: [], changes: [] },
    });
    window.history.replaceState(null, "", "/plans?tab=modules");
});
afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.clearAllMocks();
});

describe("All modules", () => {
    it("draws a column per offered plan with its price and businesses, and the legend", () => {
        open();
        const heads = matrix()
            .getAllByRole("columnheader")
            .map((h) => h.textContent);
        expect(heads[0]).toBe("Module");
        expect(heads[1]).toContain("Plan A");
        expect(heads[1]).toContain("2 businesses");
        expect(heads[2]).toContain("1 business");
        expect(heads[3]).toContain("0 businesses");
        expect(heads.slice(-2)).toEqual(["Pricing page", "Order"]);
        expect(
            screen.getByText("Click a cell to edit it plan by plan."),
        ).toBeTruthy();
        expect(screen.getByText("Changed in this draft")).toBeTruthy();
        expect(
            matrix().getByRole("button", { name: /Group one.*3 modules/ }),
        ).toBeTruthy();
        expect(matrix().getByText("Dashboard: Sell › Things")).toBeTruthy();
        // Cells: words and limits, or Locked / Hidden.
        expect(
            matrix().getByRole("button", {
                name: "Things on Plan A: 11, limit 11. Edit plan by plan",
            }),
        ).toBeTruthy();
        // A soft cap says so, in words and to a screen reader.
        const soft = matrix().getByRole("button", {
            name: "Things on Plan B: 111, soft limit 111. Edit plan by plan",
        });
        expect(within(soft).getByText("soft")).toBeTruthy();
        expect(
            within(
                matrix().getByRole("button", { name: /^Things on Plan A/ }),
            ).queryByText("soft"),
        ).toBeNull();
        expect(
            matrix().getByRole("button", {
                name: "Widgets on Plan A: Hidden. Edit plan by plan",
            }),
        ).toBeTruthy();
        expect(
            matrix().getByRole("button", {
                name: "Gadgets on Plan A: Locked. Edit plan by plan",
            }),
        ).toBeTruthy();
    });

    it("finds a module by name, and the group counts follow", () => {
        open();
        fireEvent.change(
            screen.getByRole("searchbox", { name: "Find a module" }),
            {
                target: { value: "wid" },
            },
        );
        expect(matrix().getByText("Widgets")).toBeTruthy();
        expect(matrix().queryByText("Things")).toBeNull();
        expect(matrix().queryByText("Doodads")).toBeNull();
        expect(
            matrix().getByRole("button", { name: /Group one.*1 module$/ }),
        ).toBeTruthy();
        expect(
            matrix().queryByRole("button", { name: /Group two/ }),
        ).toBeNull();

        fireEvent.change(
            screen.getByRole("searchbox", { name: "Find a module" }),
            {
                target: { value: "nothing like it" },
            },
        );
        expect(
            screen.getByText("No module matches “nothing like it”."),
        ).toBeTruthy();
    });

    it("opens the Plans tab on a cell's plan with its row focused", () => {
        open();
        fireEvent.click(
            matrix().getByRole("button", {
                name: "Widgets on Plan C: Included. Edit plan by plan",
            }),
        );
        expect(
            screen
                .getByRole("tab", { name: "Plans" })
                .getAttribute("aria-selected"),
        ).toBe("true");
        expect(window.location.search).toBe("?tab=plans");
        const chips = within(screen.getByRole("group", { name: "Plans" }));
        expect(
            chips
                .getByRole("button", { name: /^Plan C/ })
                .getAttribute("aria-pressed"),
        ).toBe("true");
        const tick = screen.getByRole("checkbox", { name: /Widgets/ });
        expect(document.activeElement).toBe(tick);
        expect(tick.closest("[data-module]")?.className).toContain(
            "bg-highlight-subtle",
        );
    });

    it("moves a module within its group, never past its edge", async () => {
        open();
        const up = matrix().getByRole("button", { name: "Move Things up" });
        const down = matrix().getByRole("button", {
            name: "Move Gadgets down",
        });
        expect(up).toHaveProperty("disabled", true);
        expect(down).toHaveProperty("disabled", true);
        expect(
            matrix().getByRole("button", { name: "Move Doodads up" }),
        ).toHaveProperty("disabled", true);

        fireEvent.click(
            matrix().getByRole("button", { name: "Move Things down" }),
        );
        expect(moduleNames().slice(0, 3)).toEqual([
            expect.stringContaining("Widgets"),
            expect.stringContaining("Things"),
            expect.stringContaining("Gadgets"),
        ]);
        const c = await saved();
        expect(c.modules.map((m) => m.id)).toEqual([
            "widgets",
            "things",
            "gadgets",
            "doodads",
        ]);
    });

    it("hides a module from the pricing page, and the page's cards leave it out", async () => {
        open();
        fireEvent.change(
            matrix().getByRole("combobox", { name: "Pricing page for Things" }),
            { target: { value: "hidden" } },
        );
        const c = await saved();
        expect(c.modules[0]?.pricing).toBe("hidden");
        expect(cardLines(c, "a").lines.map((l) => l.t)).not.toContain(
            "11 things",
        );
    });

    it("collapses a group, and all of them", () => {
        open();
        fireEvent.click(matrix().getByRole("button", { name: /^Group one/ }));
        expect(matrix().queryByText("Things")).toBeNull();
        expect(matrix().getByText("Doodads")).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Collapse all" }));
        expect(matrix().queryByText("Doodads")).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Expand all" }));
        expect(matrix().getByText("Things")).toBeTruthy();
    });

    it("adds a module as coming soon, at the end of the first group, with its details open", async () => {
        open();
        fireEvent.click(screen.getByRole("button", { name: "Add module" }));
        const details = screen.getByRole("region", {
            name: "Module details: New module",
        });
        const name = within(details).getByLabelText("Name");
        expect(document.activeElement).toBe(name);
        expect(matrix().getByText("New")).toBeTruthy();
        expect(
            matrix().getByRole("button", {
                name: /Group one.*4 modules · 1 changed/,
            }),
        ).toBeTruthy();
        const c = await saved();
        expect(c.modules.map((m) => m.name)).toEqual([
            "Things",
            "Widgets",
            "Gadgets",
            "New module",
            "Doodads",
        ]);
        expect(c.modules[3]).toMatchObject({
            group: "g1",
            pricing: "soon",
            what: "",
            cells: {},
        });
    });

    it("edits a module's details, and a new group moves it there", async () => {
        open();
        fireEvent.click(nameButton(/^Widgets/));
        const details = within(
            screen.getByRole("region", { name: "Module details: Widgets" }),
        );
        expect(
            details.getByText(
                "No menu row of its own. Its limits and access are checked where it's used.",
            ),
        ).toBeTruthy();
        fireEvent.change(details.getByLabelText("Name"), {
            target: { value: "Widgets two" },
        });
        fireEvent.change(
            details.getByLabelText(
                "What it does (shown in the dashboard's upgrade panel)",
            ),
            { target: { value: "Makes widgets" } },
        );
        fireEvent.change(
            details.getByLabelText("Row group on the pricing page"),
            {
                target: { value: "g2" },
            },
        );
        const c = await saved();
        expect(c.modules.map((m) => m.id)).toEqual([
            "things",
            "gadgets",
            "doodads",
            "widgets",
        ]);
        expect(c.modules[3]).toMatchObject({
            name: "Widgets two",
            group: "g2",
            what: "Makes widgets",
        });
        fireEvent.click(screen.getByRole("button", { name: "Done" }));
        expect(
            screen.queryByRole("region", { name: /Module details/ }),
        ).toBeNull();
    });

    it("can be read but not changed without pricing:edit", () => {
        open(
            tabData({
                access: {
                    canEdit: false,
                    canPublish: false,
                    canManageCoupons: false,
                },
            }),
        );
        expect(
            matrix().getByRole("combobox", { name: "Pricing page for Things" }),
        ).toHaveProperty("disabled", true);
        expect(
            matrix().getByRole("button", { name: "Move Things down" }),
        ).toHaveProperty("disabled", true);
        // Nothing to add or rename without pricing:edit: the controls aren't drawn.
        expect(screen.queryByRole("button", { name: "Add module" })).toBeNull();
        expect(screen.queryByRole("button", { name: "Add group" })).toBeNull();
        expect(
            matrix().queryByRole("button", { name: "Rename Group one" }),
        ).toBeNull();
        fireEvent.click(nameButton(/^Things/));
        expect(
            within(
                screen.getByRole("region", { name: "Module details: Things" }),
            ).getByLabelText("Name"),
        ).toHaveProperty("disabled", true);
    });
});

describe("row groups and taking back new modules", () => {
    it("adds a group, renames it, fills it and empties it", async () => {
        open();
        fireEvent.click(screen.getByRole("button", { name: "Add group" }));
        // An empty group shows, so it can be used.
        expect(
            matrix().getByRole("button", { name: /^New group.*Empty/ }),
        ).toBeTruthy();
        fireEvent.click(
            matrix().getByRole("button", { name: "Rename New group" }),
        );
        const input = matrix().getByLabelText("Group name");
        fireEvent.change(input, { target: { value: "Space and traffic" } });
        fireEvent.keyDown(input, { key: "Enter" });
        fireEvent.submit(input);
        expect(
            matrix().getByRole("button", { name: /^Space and traffic/ }),
        ).toBeTruthy();
        let c = await saved();
        expect(c.groups.at(-1)?.name).toBe("Space and traffic");

        fireEvent.click(
            matrix().getByRole("button", {
                name: "Remove Space and traffic",
            }),
        );
        c = await saved();
        expect(c.groups.map((g) => g.name)).toEqual(["Group one", "Group two"]);
    });

    it("offers no Remove on a group that still has modules", () => {
        open();
        expect(
            matrix().queryByRole("button", { name: "Remove Group one" }),
        ).toBeNull();
    });

    it("adds a module straight into the group asked for", async () => {
        open();
        fireEvent.click(
            matrix().getByRole("button", { name: "Add a module to Group two" }),
        );
        const c = await saved();
        expect(c.modules.at(-1)).toMatchObject({
            name: "New module",
            group: "g2",
        });
    });

    it("removes a module that was never published, and Undo brings it back", async () => {
        open();
        fireEvent.click(screen.getByRole("button", { name: "Add module" }));
        const details = screen.getByRole("region", {
            name: "Module details: New module",
        });
        fireEvent.click(
            within(details).getByRole("button", { name: "Remove module" }),
        );
        expect(screen.getByRole("status").textContent).toContain(
            "New module removed",
        );
        let c = await saved();
        expect(c.modules.some((m) => m.name === "New module")).toBe(false);
        fireEvent.click(screen.getByRole("button", { name: "Undo" }));
        c = await saved();
        expect(c.modules.some((m) => m.name === "New module")).toBe(true);
    });

    it("never offers Remove on a live module", () => {
        open();
        fireEvent.click(nameButton(/^Things/));
        expect(
            screen.queryByRole("button", { name: "Remove module" }),
        ).toBeNull();
    });
});

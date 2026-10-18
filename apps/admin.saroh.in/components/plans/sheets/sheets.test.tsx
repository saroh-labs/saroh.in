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

import type { AdminPricingImpact, ImpactItem } from "@/lib/pricing-types";

import { AUTOSAVE_MS } from "../draft-store";
import type { PlansData } from "../plans-context";
import { PlansShell } from "../plans-shell";
import { tabCatalog, tabData } from "../plans/tab-test-kit";
import {
    countedAcross,
    featureImpact,
    keepersLine,
    softAcross,
    wasLines,
} from "./sheet-model";

/**
 * The feature sheet and the plan sheet (admin redesign U12, R21, R22), on
 * the made-up catalogue of `tab-test-kit` (Plan A/B/C, Plan B highlighted;
 * Things capped at 11 / 111 (soft) / none; Widgets hidden on Plan A;
 * Gadgets locked on Plan A), inside the real shell, so autosave and the
 * draft's impact are the store's. Every name, price and limit is fake.
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

/** What the last autosave sent. */
async function saved(): Promise<Catalog> {
    await act(() => vi.advanceTimersByTimeAsync(AUTOSAVE_MS));
    const call = actions.savePricingDraftAction.mock.calls.at(-1);
    if (!call) throw new Error("nothing was saved");
    return (call[0] as { catalog: Catalog }).catalog;
}

const grid = () => screen.getByRole("grid");
const sheet = (name: string) => within(screen.getByRole("dialog", { name }));
/** One plan's line in the feature sheet. */
const line = (feature: string, planId: string) => {
    const el = screen
        .getByRole("dialog", { name: feature })
        .querySelector<HTMLElement>(`[data-plan="${planId}"]`);
    if (!el) throw new Error(`no line for ${planId}`);
    return within(el);
};
const openFeature = (name: string) =>
    fireEvent.click(within(grid()).getByRole("rowheader", { name }));
const openPlan = (name: string) =>
    fireEvent.click(
        within(grid()).getByRole("button", { name: `${name}'s settings` }),
    );
const closeSheet = (name: string) =>
    fireEvent.click(sheet(name).getByRole("button", { name: "Close" }));
const cell = (name: string) => {
    const el = grid().querySelector<HTMLElement>(`[data-cell="${name}"]`);
    if (!el) throw new Error(`no cell ${name}`);
    return el;
};
const things = (c: Catalog, plan: string) =>
    c.modules.find((m) => m.id === "things")?.cells[plan];

function item(over: Partial<ImpactItem>): ImpactItem {
    return {
        tone: "warn",
        label: "Check",
        title: "",
        detail: "",
        businesses: [],
        ...over,
    };
}

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

describe("the feature sheet", () => {
    it("opens from a feature's name with every plan's line and no Save button", () => {
        open();
        openFeature("Things");
        const s = sheet("Things");
        expect(
            s.getByText("A limit, counted in total · Group one"),
        ).toBeTruthy();
        for (const id of ["a", "b", "c"]) {
            expect(line("Things", id).getByRole("checkbox")).toBeTruthy();
        }
        expect(
            line("Things", "a").getByLabelText("Limit (empty for none)"),
        ).toHaveProperty("value", "11");
        expect(
            line("Things", "b").getByText("Reaches 1 business at renewal"),
        ).toBeTruthy();
        expect(s.queryByRole("button", { name: /save/i })).toBeNull();
        expect(
            s.getByText("Every change is saved to the draft as you make it."),
        ).toBeTruthy();
    });

    it("opens from the keyboard: ← from a row's first plan, then Enter", () => {
        open();
        const first = cell("Things on Plan A");
        first.focus();
        fireEvent.keyDown(first, { key: "ArrowLeft" });
        const name = within(grid()).getByRole("rowheader", { name: "Things" });
        expect(document.activeElement).toBe(name);
        fireEvent.keyDown(name, { key: "Enter" });
        expect(screen.getByRole("dialog", { name: "Things" })).toBeTruthy();
    });

    it("changes two plans at once: both cells change and autosave, with no Save", async () => {
        open();
        openFeature("Things");
        fireEvent.change(
            line("Things", "a").getByLabelText("Limit (empty for none)"),
            { target: { value: "22" } },
        );
        fireEvent.change(
            line("Things", "b").getByLabelText("Limit (empty for none)"),
            { target: { value: "222" } },
        );
        // Was → now, beside each plan.
        expect(line("Things", "a").getByText("Was 11")).toBeTruthy();
        expect(line("Things", "b").getByText("Was 111")).toBeTruthy();

        const c = await saved();
        expect(actions.savePricingDraftAction).toHaveBeenCalledTimes(1);
        expect(things(c, "a")).toMatchObject({ limit: 22, text: "22" });
        expect(things(c, "b")).toMatchObject({ limit: 222, text: "222" });
        // The card line followed the number it said.
        expect(things(c, "a")).toMatchObject({ card: "22 things" });

        closeSheet("Things");
        expect(cell("Things on Plan A").getAttribute("aria-label")).toBe(
            "22, was 11",
        );
        expect(cell("Things on Plan B").getAttribute("aria-label")).toBe(
            "222, was 111",
        );
    });

    it("counts it the same way on every plan, and makes every cap soft at once", async () => {
        open();
        openFeature("Things");
        const s = sheet("Things");
        // Plan B's cap is soft, Plan A's hard: a mix.
        const soft = s.getByRole("checkbox", {
            name: /Soft limit on every plan/,
        });
        expect(soft.getAttribute("aria-checked")).toBe("mixed");
        expect(s.getByText("Soft on Plan B; hard on Plan A")).toBeTruthy();

        fireEvent.change(s.getByLabelText("Counted, on every plan"), {
            target: { value: "month" },
        });
        fireEvent.click(soft);
        expect(soft.getAttribute("aria-checked")).toBe("true");
        expect(
            s.getByText("A limit, counted each month · Group one"),
        ).toBeTruthy();

        const c = await saved();
        expect(things(c, "a")).toMatchObject({ per: "month", soft: true });
        expect(things(c, "b")).toMatchObject({ per: "month", soft: true });
        // No cap on Plan C: counted the same, never soft.
        expect(things(c, "c")).toMatchObject({ per: "month", soft: false });
    });

    it("ticks a plan off and on again with live's words, and switches Locked and Hidden", async () => {
        open();
        openFeature("Things");
        const tick = () =>
            line("Things", "b").getByRole("checkbox", {
                name: "Plan B has Things",
            });
        fireEvent.click(tick());
        expect(line("Things", "b").getByText("Was 111")).toBeTruthy();
        expect(line("Things", "b").getByText("In the dashboard:")).toBeTruthy();
        fireEvent.click(tick());
        expect(
            line("Things", "b").getByLabelText("Comparison table"),
        ).toHaveProperty("value", "111");
        expect(line("Things", "b").queryByText("Changed")).toBeNull();
        closeSheet("Things");

        openFeature("Widgets");
        expect(
            line("Widgets", "a").getByText("Not in the menu at all."),
        ).toBeTruthy();
        fireEvent.click(
            line("Widgets", "a").getByRole("radio", {
                name: "Locked on Plan A",
            }),
        );
        expect(line("Widgets", "a").getByText("Was hidden")).toBeTruthy();
        const c = await saved();
        expect(c.modules.find((m) => m.id === "widgets")?.cells.a).toEqual({
            inc: false,
            off: "locked",
        });
    });

    it("says a refused limit beside its field, and never saves it", async () => {
        open();
        openFeature("Things");
        const limit = line("Things", "a").getByLabelText(
            "Limit (empty for none)",
        );
        fireEvent.change(limit, { target: { value: "0" } });
        expect(limit.getAttribute("aria-invalid")).toBe("true");
        expect(
            document.getElementById(
                limit.getAttribute("aria-describedby") ?? "",
            )?.textContent,
        ).toBe("A whole number above 0, or blank for no limit");
        await act(() => vi.advanceTimersByTimeAsync(AUTOSAVE_MS * 2));
        expect(actions.savePricingDraftAction).not.toHaveBeenCalled();
    });

    it("recounts each plan's usage line as its limit is typed", () => {
        open();
        openFeature("Things");
        expect(
            line("Things", "a").getByText(
                "2 of 2 use it · highest 10 · 1 at 80%+",
            ),
        ).toBeTruthy();
        fireEvent.change(
            line("Things", "a").getByLabelText("Limit (empty for none)"),
            { target: { value: "5" } },
        );
        expect(
            line("Things", "a").getByText(
                "2 of 2 use it · highest 10 · 1 over the limit",
            ),
        ).toBeTruthy();
    });

    it("lists who the change touches from the draft's impact, and only this feature's", async () => {
        const impact: AdminPricingImpact = {
            revision: 1,
            liveVersion: 1,
            impact: {
                items: [
                    item({
                        tone: "danger",
                        label: "Takes away",
                        title: "Things on Plan A: 11 → 5",
                        detail: "1 over the new limit.",
                        businesses: [{ id: "o1", name: "Made-up Studio" }],
                    }),
                    item({
                        tone: "ok",
                        label: "Gives more",
                        title: "Widgets added to Plan A",
                        detail: "2 businesses on Plan A get it.",
                    }),
                ],
                touched: 1,
                total: 3,
                revenue: { nowPaise: 0, nextPaise: 0 },
            },
        };
        actions.pricingImpactAction.mockResolvedValue({
            ok: true,
            data: impact,
        });
        open();
        openFeature("Things");
        const who = () =>
            within(
                sheet("Things").getByRole("region", {
                    name: "Who this touches",
                }),
            );
        expect(who().getByText(/Nothing about this feature/)).toBeTruthy();

        fireEvent.change(
            line("Things", "a").getByLabelText("Limit (empty for none)"),
            { target: { value: "5" } },
        );
        expect(
            who().getByText("Worked out once the draft is saved…"),
        ).toBeTruthy();
        await saved();
        await act(() => vi.advanceTimersByTimeAsync(0));

        expect(who().getByText("Things on Plan A: 11 → 5")).toBeTruthy();
        expect(who().getByText("1 over the new limit.")).toBeTruthy();
        expect(who().getByText("Made-up Studio")).toBeTruthy();
        expect(who().queryByText("Widgets added to Plan A")).toBeNull();
    });

    it("reads the same without pricing:edit, and changes nothing", () => {
        open(readOnly());
        openFeature("Things");
        expect(
            line("Things", "a").getByLabelText("Limit (empty for none)"),
        ).toHaveProperty("disabled", true);
        expect(
            line("Things", "a").getByRole("checkbox", {
                name: "Plan A has Things",
            }),
        ).toHaveProperty("disabled", true);
        expect(
            sheet("Things").getByText(
                "You can read pricing but not change it.",
            ),
        ).toBeTruthy();
    });
});

describe("the plan sheet", () => {
    it("opens from a plan's pencil with its fields, who is on it and its card", () => {
        open();
        openPlan("Plan B");
        const s = sheet("Edit Plan B");
        expect(
            s.getByText(
                "1 business on Plan B · 1 on an older version · highlighted on the pricing page",
            ),
        ).toBeTruthy();
        expect(s.getByLabelText("Name")).toHaveProperty("value", "Plan B");
        expect(s.getByLabelText("Price a month, before GST")).toHaveProperty(
            "value",
            "111",
        );
        expect(s.getByLabelText("Button")).toHaveProperty("value", "Try B");
        const card = within(
            s.getByRole("region", {
                name: "Preview of Plan B on the pricing page",
            }),
        );
        expect(card.getByText("Highlighted")).toBeTruthy();
        expect(card.getByText("Try B")).toBeTruthy();
        expect(card.getByText("Everything in Plan A, plus:")).toBeTruthy();
        expect(s.queryByRole("button", { name: /save/i })).toBeNull();
    });

    it("opens from the keyboard: Enter on the header, Tab to the pencil, Enter", () => {
        open();
        const head = grid().querySelector<HTMLElement>('[data-plan="b"]');
        if (!head) throw new Error("no header");
        head.focus();
        fireEvent.keyDown(head, { key: "Enter" });
        const price = within(head).getByRole("textbox");
        expect(document.activeElement).toBe(price);
        const pencil = within(head).getByRole("button", {
            name: "Plan B's settings",
        });
        expect(pencil.getAttribute("tabindex")).toBe("0");
        pencil.focus();
        fireEvent.click(pencil);
        expect(
            screen.getByRole("dialog", { name: "Edit Plan B" }),
        ).toBeTruthy();
    });

    it("updates the card live as the fields are typed, and autosaves", async () => {
        open();
        openPlan("Plan B");
        const s = sheet("Edit Plan B");
        fireEvent.change(s.getByLabelText("Name"), {
            target: { value: "Plan Bee" },
        });
        const t = sheet("Edit Plan Bee");
        fireEvent.change(t.getByLabelText("One line under the name"), {
            target: { value: "For made-up shops." },
        });
        fireEvent.change(t.getByLabelText("Button"), {
            target: { value: "Pick Bee" },
        });
        fireEvent.change(t.getByLabelText("Price a month, before GST"), {
            target: { value: "333.5" },
        });
        const card = within(
            t.getByRole("region", {
                name: "Preview of Plan Bee on the pricing page",
            }),
        );
        expect(card.getByText("Plan Bee")).toBeTruthy();
        expect(card.getByText("For made-up shops.")).toBeTruthy();
        expect(card.getByText("Pick Bee")).toBeTruthy();
        expect(card.getByText(/333\.50/)).toBeTruthy();

        const c = await saved();
        expect(c.plans.find((p) => p.id === "b")).toMatchObject({
            name: "Plan Bee",
            tagline: "For made-up shops.",
            cta: "Pick Bee",
            pricePaise: 33_350,
        });
    });

    it("refuses a price that isn't rupees beside the box, and never saves it", async () => {
        open();
        openPlan("Plan B");
        const price = sheet("Edit Plan B").getByLabelText(
            "Price a month, before GST",
        );
        fireEvent.change(price, { target: { value: "-5" } });
        expect(price.getAttribute("aria-invalid")).toBe("true");
        expect(
            document.getElementById(
                price.getAttribute("aria-describedby") ?? "",
            )?.textContent,
        ).toBe("Enter rupees, like 499 or 499.50");
        await act(() => vi.advanceTimersByTimeAsync(AUTOSAVE_MS * 2));
        expect(actions.savePricingDraftAction).not.toHaveBeenCalled();
    });

    it("says a blank name beside the Name field", () => {
        open();
        openPlan("Plan B");
        fireEvent.change(sheet("Edit Plan B").getByLabelText("Name"), {
            target: { value: "" },
        });
        const name = sheet("Edit Unnamed plan").getByLabelText("Name");
        expect(name.getAttribute("aria-invalid")).toBe("true");
        expect(
            document.getElementById(name.getAttribute("aria-describedby") ?? "")
                ?.textContent,
        ).toBe("This can't be blank");
    });

    it("highlights one plan at most", async () => {
        open();
        openPlan("Plan C");
        fireEvent.click(
            sheet("Edit Plan C").getByRole("checkbox", {
                name: "Highlight this plan on the pricing page",
            }),
        );
        expect(
            within(
                sheet("Edit Plan C").getByRole("region", {
                    name: "Preview of Plan C on the pricing page",
                }),
            ).getByText("Highlighted"),
        ).toBeTruthy();
        const c = await saved();
        expect(c.plans.filter((p) => p.featured).map((p) => p.id)).toEqual([
            "c",
        ]);
    });

    it("Retire says who keeps the plan, and can be taken back", async () => {
        open();
        openPlan("Plan B");
        const retire = () =>
            within(
                sheet("Edit Plan B").getByRole("region", {
                    name: "Retire Plan B",
                }),
            );
        expect(
            retire().getByText(
                /The 1 business on it keeps it until it changes plan\./,
            ),
        ).toBeTruthy();
        fireEvent.click(
            retire().getByRole("button", { name: "Retire Plan B" }),
        );
        expect(
            retire().getByText("Plan B is retired in this draft"),
        ).toBeTruthy();
        expect(
            retire().getByText(
                /The 1 business on it keeps it until it changes plan\./,
            ),
        ).toBeTruthy();
        let c = await saved();
        expect(c.plans.find((p) => p.id === "b")?.retired).toBe(true);

        fireEvent.click(
            retire().getByRole("button", { name: "Offer it again" }),
        );
        c = await saved();
        expect(c.plans.find((p) => p.id === "b")?.retired).toBe(false);
    });

    it("says nobody keeps a plan nobody is on", () => {
        open();
        openPlan("Plan C");
        expect(
            sheet("Edit Plan C").getByText(/No business is on it today\./),
        ).toBeTruthy();
    });

    it("reads the same without pricing:edit", () => {
        open(readOnly());
        openPlan("Plan B");
        const s = sheet("Edit Plan B");
        expect(s.getByLabelText("Name")).toHaveProperty("disabled", true);
        expect(s.getByLabelText("Price a month, before GST")).toHaveProperty(
            "disabled",
            true,
        );
        expect(s.getByRole("button", { name: "Retire Plan B" })).toHaveProperty(
            "disabled",
            true,
        );
        expect(s.queryByRole("button", { name: "Remove plan" })).toBeNull();
    });
});

describe("the sheets' rules", () => {
    const catalog = tabCatalog();
    const byId = (c: Catalog, id: string) => {
        const m = c.modules.find((x) => x.id === id);
        if (!m) throw new Error(`no module ${id}`);
        return m;
    };
    const thingsModule = byId(catalog, "things");

    it("reads how a feature is counted and whether it is soft, across plans", () => {
        expect(countedAcross(thingsModule, catalog.plans)).toBe("");
        expect(softAcross(thingsModule, catalog.plans)).toBe("mixed");
        const doodads = byId(catalog, "doodads");
        // Only Plan C has it, with no cap: counted, but nothing to be soft.
        expect(countedAcross(doodads, catalog.plans)).toBe("");
        expect(softAcross(doodads, catalog.plans)).toBeNull();
    });

    it("says what a cell was, and nothing when it hasn't changed", () => {
        const next = structuredClone(catalog);
        const m = byId(next, "things");
        expect(wasLines(catalog, m, "a", true)).toEqual([]);
        m.cells.a = {
            inc: true,
            text: "Up to 11",
            card: "",
            limit: 11,
            per: "",
            soft: false,
        };
        expect(wasLines(catalog, m, "a", true)).toEqual([
            "The table said “11”",
            "The card said “11 things”",
        ]);
        expect(wasLines(null, m, "a", true)).toEqual([]);
    });

    it("keeps only the impact items about one feature", () => {
        const items = [
            item({ title: "Things on Plan A: 11 → 5" }),
            item({ title: "Things taken off Plan B" }),
            item({ title: "Thingsmore on Plan A: 1 → 2" }),
            item({ title: "New module: Things" }),
            item({ title: "Plan B: ₹1 → ₹2 a month" }),
        ];
        expect(featureImpact(items, "Things").map((i) => i.title)).toEqual([
            "Things on Plan A: 11 → 5",
            "Things taken off Plan B",
            "New module: Things",
        ]);
    });

    it("says who keeps a retired plan", () => {
        expect(keepersLine(0)).toBe("No business is on it today.");
        expect(keepersLine(2)).toBe(
            "The 2 businesses on it keep it until they change plan.",
        );
    });
});

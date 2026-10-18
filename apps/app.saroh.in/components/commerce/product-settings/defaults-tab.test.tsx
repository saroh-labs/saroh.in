// @vitest-environment jsdom
/**
 * Product settings › Defaults: one All products card, then a row per
 * category saying only what it sets for itself, with Edit opening its
 * sheet; every suggestion in one line with Review, and "Not now" kept for
 * the business.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CatalogueView } from "@/lib/products/settings";

import { DefaultsTab } from "./defaults-tab";
import { lostLine } from "./product-settings";
import { stage } from "./test-kit";

const saveDefaults = vi.fn();
vi.mock("@/lib/products/settings-actions", () => ({
    saveDefaults: (...a: unknown[]) => saveDefaults(...a) as unknown,
    undoDefaults: vi.fn(),
}));
const markMomentSeen = vi.fn();
vi.mock("@/lib/moments/actions", () => ({
    markMomentSeen: (...a: unknown[]) => markMomentSeen(...a) as unknown,
}));
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
const showUndo = vi.fn();
vi.mock("@saroh/ui/toast", () => ({
    showError: vi.fn(),
    showUndo: (...a: unknown[]) => showUndo(...a) as unknown,
}));
vi.mock("@saroh/ui/sheet", async () =>
    (await import("./test-kit")).sheetMock(),
);

const cat = (id: string, name: string) => ({
    id,
    name,
    slug: id,
    parentId: null,
    productCount: 6,
});
const low = (key: string, value: number) => ({
    key,
    field: "lowStockAlert" as const,
    value,
    count: 5,
    total: 5,
});

function catalogue(over: Partial<CatalogueView["defaults"]> = {}) {
    return {
        categories: [cat("c1", "Poetry"), cat("c2", "Pune writers")],
        uncategorizedCount: 0,
        options: [],
        defaults: {
            entries: {
                all: {
                    howToUse: null,
                    lowStockAlert: 10,
                    returnsMode: "STOREFRONT" as const,
                    returnsText: null,
                },
                c1: {
                    howToUse: null,
                    lowStockAlert: 1,
                    returnsMode: "OWN" as const,
                    returnsText: "Non-returnable",
                },
            },
            stillOnDefault: {},
            productCounts: { all: 12, c1: 6, c2: 6 },
            suggestions: [low("c1", 2), low("c2", 1)],
            ...over,
        },
        canWrite: true,
    } satisfies CatalogueView;
}

const s = stage();
beforeEach(() => {
    s.mount();
    for (const m of [saveDefaults, markMomentSeen, showUndo]) m.mockReset();
    markMomentSeen.mockResolvedValue({ ok: true, data: { seen: [] } });
});
afterEach(() => s.unmount());

describe("Defaults", () => {
    it("shows All products, then each category's own values only", () => {
        s.render(<DefaultsTab catalogue={catalogue()} />);
        expect(s.text()).toContain("All products");
        expect(s.text()).toContain("Low stock at");
        expect(s.text()).toContain(
            "Needs you lists it when this many or fewer are left.",
        );
        expect(s.text()).toContain("Low stock at 1 · Returns: Non-returnable");
        expect(s.text()).toContain("Same as All products");
        expect(s.button("Edit Poetry defaults")).toBeDefined();
        // One card's fields, not one per category.
        expect(s.inputs()).toHaveLength(2);
    });

    it("says every suggestion in one line, once", () => {
        s.render(<DefaultsTab catalogue={catalogue()} />);
        expect(s.text()).toContain("2 categories usually warn lower than 10.");
        expect(s.button("Review")).toBeDefined();
        expect(s.text()).not.toContain("Make it the default?");
    });

    it("puts the suggestions away for the business on Not now", () => {
        s.render(<DefaultsTab catalogue={catalogue()} />);
        s.press("Not now");
        expect(markMomentSeen).toHaveBeenCalledWith("defaults-suggestions");
        expect(s.button("Review")).toBeUndefined();
    });

    it("shows no line once put away", () => {
        s.render(
            <DefaultsTab catalogue={catalogue({ suggestionsPutAway: true })} />,
        );
        expect(s.button("Review")).toBeUndefined();
    });

    it("names a category's fields with the category, in its sheet", () => {
        s.render(<DefaultsTab catalogue={catalogue()} />);
        s.press("Edit Pune writers defaults");
        const labels = s
            .inputs(s.sheet())
            .map((i) => i.getAttribute("aria-label"));
        expect(labels).toContain("Pune writers: low stock at");
        expect(labels).toContain("Pune writers: how to use or care for it");
        // Its own suggestion is offered beside the field.
        expect(s.sheet()?.textContent).toContain(
            "All 5 Pune writers that track stock warn at 1.",
        );
    });

    it("saves a category from its sheet, alone", async () => {
        saveDefaults.mockResolvedValue({
            ok: true,
            data: { updatedCount: 0 },
        });
        s.render(<DefaultsTab catalogue={catalogue()} />);
        s.press("Edit Pune writers defaults");
        s.type(s.inputs(s.sheet())[0], "3");
        await s.submit(s.sheet());
        expect(saveDefaults).toHaveBeenCalledTimes(1);
        const [entries] = saveDefaults.mock.calls[0] as [
            { key: string; lowStockAlert: number | null }[],
        ];
        expect(entries).toEqual([
            expect.objectContaining({ key: "c2", lowStockAlert: 3 }),
        ]);
        expect(showUndo.mock.calls[0]?.[0]).toBe(
            "Pune writers saved. New products in it start with this.",
        );
    });

    it("leaves with the tab and the count named", () => {
        expect(lostLine(1, "defaults")).toBe(
            "Your 1 change to Defaults will be lost.",
        );
        expect(lostLine(2, "sku")).toBe("Your 2 changes to SKUs will be lost.");
    });
});

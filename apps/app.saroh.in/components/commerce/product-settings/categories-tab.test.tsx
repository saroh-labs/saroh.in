// @vitest-environment jsdom
/**
 * Product settings › Categories, read first: the list shows with nothing
 * open; New category and Rename open a one-field dialog, Merge a side
 * sheet that says what moves where, Delete a confirm. No row ever turns
 * into a form. A refusal keeps what was typed; a save puts it away.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CatalogueView } from "@/lib/products/settings";

import { CategoriesTab } from "./categories-tab";
import { stage } from "./test-kit";

const actions = {
    addCategory: vi.fn(),
    renameCategory: vi.fn(),
    mergeCategory: vi.fn(),
    removeCategory: vi.fn(),
    restoreCategory: vi.fn(),
};
vi.mock("@/lib/products/settings-actions", () => ({
    addCategory: (...a: unknown[]) => actions.addCategory(...a) as unknown,
    renameCategory: (...a: unknown[]) =>
        actions.renameCategory(...a) as unknown,
    mergeCategory: (...a: unknown[]) => actions.mergeCategory(...a) as unknown,
    removeCategory: (...a: unknown[]) =>
        actions.removeCategory(...a) as unknown,
    restoreCategory: (...a: unknown[]) =>
        actions.restoreCategory(...a) as unknown,
}));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), refresh }),
}));
const showError = vi.fn();
const showUndo = vi.fn();
vi.mock("@saroh/ui/toast", () => ({
    showError: (...a: unknown[]) => showError(...a) as unknown,
    showUndo: (...a: unknown[]) => showUndo(...a) as unknown,
}));
vi.mock("@saroh/ui/sheet", async () =>
    (await import("./test-kit")).sheetMock(),
);
vi.mock("@saroh/ui/dialog", async () =>
    (await import("./test-kit")).dialogMock(),
);
vi.mock("@/components/shared/confirm-dialog", async () =>
    (await import("./test-kit")).confirmMock(),
);

const cat = (id: string, name: string, productCount: number) => ({
    id,
    name,
    slug: name.toLowerCase(),
    parentId: null,
    productCount,
});

function catalogue(over: Partial<CatalogueView> = {}): CatalogueView {
    return {
        categories: [cat("c1", "Serums", 3), cat("c2", "Lip care", 1)],
        uncategorizedCount: 2,
        options: [],
        defaults: {
            entries: {},
            stillOnDefault: {},
            productCounts: {},
            suggestions: [],
        },
        canWrite: true,
        ...over,
    };
}

const s = stage();
const render = (c = catalogue()) => s.render(<CategoriesTab catalogue={c} />);

beforeEach(() => {
    s.mount();
    for (const m of [...Object.values(actions), refresh, showError, showUndo])
        m.mockReset();
});
afterEach(() => s.unmount());

describe("the list", () => {
    it("shows every category with nothing open", () => {
        render();
        expect(s.text()).toContain("Serums");
        expect(s.text()).toContain("3 products");
        expect(s.text()).toContain("Lip care");
        expect(s.text()).toContain("1 product");
        expect(s.text()).toContain("Uncategorized");
        expect(s.text()).toContain("2 products");
        expect(s.inputs()).toHaveLength(0);
        expect(s.dialog()).toBe(null);
        expect(s.sheet()).toBe(null);
        expect(s.confirm()).toBe(null);
        expect(s.button("New category")).toBeDefined();
        for (const verb of ["Rename", "Merge", "Delete"])
            expect(s.button(`${verb} Serums`)).toBeDefined();
    });

    it("has no actions for a role that can only read", () => {
        render(catalogue({ canWrite: false }));
        expect(s.text()).toContain("Serums");
        expect(s.text()).toContain("Your role can read these settings");
        expect(s.button("New category")).toBeUndefined();
        for (const verb of ["Rename", "Merge", "Delete"])
            expect(s.button(`${verb} Serums`)).toBeUndefined();
    });

    it("says none yet, with the way to add one", () => {
        render(catalogue({ categories: [] }));
        expect(s.text()).toContain("No categories yet");
        // One button, in the empty state.
        expect(
            Array.from(document.querySelectorAll("button")).filter(
                (b) => b.textContent.trim() === "New category",
            ),
        ).toHaveLength(1);
        expect(s.text()).toContain("Uncategorized");
    });
});

describe("New category", () => {
    function open() {
        render();
        s.press("New category");
        return s.inputs(s.dialog())[0];
    }

    it("opens a dialog named New category with the one field", () => {
        const input = open();
        expect(s.title(s.dialog())).toBe("New category");
        expect(s.inputs(s.dialog())).toHaveLength(1);
        expect(input.value).toBe("");
        expect(s.button("Add category", s.dialog())).toBeDefined();
        expect(s.button("Cancel", s.dialog())).toBeDefined();
    });

    it("adds it, closes, and the list shows it", async () => {
        actions.addCategory.mockResolvedValue({ ok: true, data: { id: "c3" } });
        const input = open();
        s.type(input, "  Body care ");
        await s.submit(s.dialog());
        expect(actions.addCategory).toHaveBeenCalledWith("Body care");
        expect(s.dialog()).toBe(null);
        expect(refresh).toHaveBeenCalled();
        expect(showUndo.mock.calls[0][0]).toBe("Body care added.");
        render(
            catalogue({
                categories: [
                    ...catalogue().categories,
                    cat("c3", "Body care", 0),
                ],
            }),
        );
        expect(s.text()).toContain("Body care");
    });

    it("keeps what was typed when the server refuses", async () => {
        actions.addCategory.mockResolvedValue({
            ok: false,
            error: "You've reached your plan's categories.",
        });
        const input = open();
        s.type(input, "Body care");
        await s.submit(s.dialog());
        expect(showError).toHaveBeenCalledWith(
            "You've reached your plan's categories.",
        );
        expect(s.dialog()).not.toBe(null);
        expect(s.inputs(s.dialog())[0].value).toBe("Body care");
        expect(showUndo).not.toHaveBeenCalled();
    });

    it("refuses a name that is taken, too long or empty, unsent", async () => {
        const input = open();
        await s.submit(s.dialog());
        expect(s.dialog()?.textContent).toContain("A category needs a name.");
        s.type(input, "serums");
        expect(s.dialog()?.textContent).toContain(
            "There is already a category called serums.",
        );
        s.type(input, "Uncategorized");
        expect(s.dialog()?.textContent).toContain("There is already");
        s.type(input, "x".repeat(41));
        expect(s.dialog()?.textContent).toContain(
            "Keep it under 40 characters.",
        );
        await s.submit(s.dialog());
        expect(actions.addCategory).not.toHaveBeenCalled();
        expect(s.dialog()).not.toBe(null);
    });

    it("drops the draft on Cancel, and saves nothing", () => {
        const input = open();
        s.type(input, "Body care");
        s.press("Cancel", s.dialog());
        expect(s.dialog()).toBe(null);
        expect(actions.addCategory).not.toHaveBeenCalled();
        s.press("New category");
        expect(s.inputs(s.dialog())[0].value).toBe("");
    });
});

describe("Rename", () => {
    function open() {
        render();
        s.press("Rename Serums");
        return s.inputs(s.dialog())[0];
    }

    it("opens a dialog with the name, and the row stays a row", () => {
        const input = open();
        expect(s.title(s.dialog())).toBe("Rename category");
        expect(input.value).toBe("Serums");
        // The row is still read behind it: its buttons, no field of its own.
        expect(s.button("Merge Serums")).toBeDefined();
        expect(s.inputs()).toHaveLength(1);
    });

    it("saves the new name and closes", async () => {
        actions.renameCategory.mockResolvedValue({ ok: true, data: {} });
        s.type(open(), "Face serums");
        await s.submit(s.dialog());
        expect(actions.renameCategory).toHaveBeenCalledWith(
            "c1",
            "Face serums",
        );
        expect(s.dialog()).toBe(null);
        expect(showUndo.mock.calls[0][0]).toBe("Serums is now Face serums.");
    });

    it("points a taken name at Merge, unsent", async () => {
        s.type(open(), "Lip care");
        expect(s.dialog()?.textContent).toContain(
            "That name is taken — use Merge to combine them.",
        );
        await s.submit(s.dialog());
        expect(actions.renameCategory).not.toHaveBeenCalled();
    });

    it("keeps what was typed when the server refuses", async () => {
        actions.renameCategory.mockResolvedValue({ ok: false, error: "No." });
        s.type(open(), "Face serums");
        await s.submit(s.dialog());
        expect(showError).toHaveBeenCalledWith("No.");
        expect(s.inputs(s.dialog())[0].value).toBe("Face serums");
    });

    it("closes without a call when the name is unchanged", async () => {
        open();
        await s.submit(s.dialog());
        expect(actions.renameCategory).not.toHaveBeenCalled();
        expect(s.dialog()).toBe(null);
    });
});

describe("Merge", () => {
    function open() {
        render();
        s.press("Merge Serums");
    }
    const radio = (name: string) =>
        Array.from(
            s.sheet()?.querySelectorAll<HTMLElement>('[role="radio"]') ?? [],
        ).find((r) => r.textContent === name);

    it("opens a sheet that asks where the products go", () => {
        open();
        expect(s.title(s.sheet())).toBe("Merge Serums");
        expect(radio("Lip care")).toBeDefined();
        expect(radio("Uncategorized")).toBeDefined();
        expect(radio("Serums")).toBeUndefined();
        expect(s.sheet()?.textContent).toContain(
            "Pick where its products should go.",
        );
        expect(s.button("Merge category", s.sheet())?.disabled).toBe(true);
        // The row is still a row behind it.
        expect(s.button("Rename Serums")).toBeDefined();
    });

    it("says what moves where, then merges and closes", async () => {
        actions.mergeCategory.mockResolvedValue({ ok: true, data: {} });
        open();
        s.press("Lip care", s.sheet());
        expect(s.sheet()?.textContent).toContain(
            "The 3 products in Serums move to Lip care, and Serums goes away.",
        );
        await s.submit(s.sheet());
        expect(actions.mergeCategory).toHaveBeenCalledWith("c1", "c2");
        expect(s.sheet()).toBe(null);
        expect(showUndo.mock.calls[0][0]).toBe("Serums merged into Lip care.");
    });

    it("sends Uncategorized as no category", async () => {
        actions.mergeCategory.mockResolvedValue({ ok: true, data: {} });
        open();
        s.press("Uncategorized", s.sheet());
        await s.submit(s.sheet());
        expect(actions.mergeCategory).toHaveBeenCalledWith("c1", null);
    });

    it("stays open with the choice when the server refuses", async () => {
        actions.mergeCategory.mockResolvedValue({
            ok: false,
            error: "A discount reaches Serums.",
        });
        open();
        s.press("Lip care", s.sheet());
        await s.submit(s.sheet());
        expect(showError).toHaveBeenCalledWith("A discount reaches Serums.");
        expect(radio("Lip care")?.getAttribute("aria-checked")).toBe("true");
    });

    it("moves nothing on Cancel", () => {
        open();
        s.press("Lip care", s.sheet());
        s.press("Cancel", s.sheet());
        expect(s.sheet()).toBe(null);
        expect(actions.mergeCategory).not.toHaveBeenCalled();
    });
});

describe("Delete", () => {
    it("asks first, saying where its products go", () => {
        render();
        s.press("Delete Serums");
        expect(s.title(s.confirm())).toBe("Delete Serums?");
        expect(s.confirm()?.textContent).toContain(
            "Its 3 products move to Uncategorized. The products themselves are not touched.",
        );
        expect(s.button("Rename Serums")).toBeDefined();
        expect(actions.removeCategory).not.toHaveBeenCalled();
    });

    it("says one product moves, and none when none use it", () => {
        render(catalogue({ categories: [cat("c2", "Lip care", 1)] }));
        s.press("Delete Lip care");
        expect(s.confirm()?.textContent).toContain(
            "Its 1 product moves to Uncategorized.",
        );
        s.press("Keep it", s.confirm());
        render(catalogue({ categories: [cat("c9", "Empty", 0)] }));
        s.press("Delete Empty");
        expect(s.confirm()?.textContent).toContain("No products use it.");
    });

    it("deletes on confirm, with Undo", async () => {
        actions.removeCategory.mockResolvedValue({ ok: true, data: {} });
        render();
        s.press("Delete Serums");
        s.press("Delete category", s.confirm());
        await s.settle();
        expect(actions.removeCategory).toHaveBeenCalledWith("c1");
        expect(showUndo.mock.calls[0][0]).toBe("Serums deleted.");
        expect(s.confirm()).toBe(null);
    });

    it("keeps it on Keep it", () => {
        render();
        s.press("Delete Serums");
        s.press("Keep it", s.confirm());
        expect(s.confirm()).toBe(null);
        expect(actions.removeCategory).not.toHaveBeenCalled();
    });
});

// @vitest-environment jsdom
/**
 * Product settings › Custom fields, read first: each field as a card with
 * nothing to fill in; Add field and Edit open the one side sheet, where
 * the name, who sees it and its categories are saved together. A refusal
 * keeps what was typed; a save puts it away.
 */
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CatalogueView, FieldView } from "@/lib/products/settings";

import { FieldsTab } from "./fields-tab";
import { stage } from "./test-kit";

const actions = {
    addField: vi.fn(),
    updateField: vi.fn(),
    removeField: vi.fn(),
    restoreField: vi.fn(),
};
vi.mock("@/lib/products/settings-actions", () => ({
    addField: (...a: unknown[]) => actions.addField(...a) as unknown,
    updateField: (...a: unknown[]) => actions.updateField(...a) as unknown,
    removeField: (...a: unknown[]) => actions.removeField(...a) as unknown,
    restoreField: (...a: unknown[]) => actions.restoreField(...a) as unknown,
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

const CATALOGUE: CatalogueView = {
    categories: [
        {
            id: "c1",
            name: "Serums",
            slug: "s",
            parentId: null,
            productCount: 3,
        },
        {
            id: "c2",
            name: "Dresses",
            slug: "d",
            parentId: null,
            productCount: 1,
        },
    ],
    uncategorizedCount: 0,
    options: [],
    defaults: {
        entries: {},
        stillOnDefault: {},
        productCounts: {},
        suggestions: [],
    },
    canWrite: true,
};
const SKIN: FieldView = {
    id: "f1",
    name: "Skin type",
    type: "TEXT",
    onShop: false,
    position: 0,
    categoryIds: ["c1"],
    productCount: 3,
};
const CARE: FieldView = {
    id: "f2",
    name: "Fabric care",
    type: "YES_NO",
    onShop: true,
    position: 1,
    categoryIds: [],
    productCount: 0,
};

const s = stage();
const render = (fields: FieldView[] = [SKIN, CARE], canWrite = true) =>
    s.render(
        <FieldsTab catalogue={{ ...CATALOGUE, canWrite }} fields={fields} />,
    );
const pressed = (name: string) =>
    Array.from(
        s.sheet()?.querySelectorAll<HTMLElement>("[aria-pressed]") ?? [],
    ).find((b) => b.textContent === name);
const radio = (name: string) =>
    Array.from(
        s.sheet()?.querySelectorAll<HTMLElement>('[role="radio"]') ?? [],
    ).find((b) => b.textContent === name);

beforeEach(() => {
    s.mount();
    for (const m of [...Object.values(actions), refresh, showError, showUndo])
        m.mockReset();
});
afterEach(() => s.unmount());

describe("the list", () => {
    it("reads each field with nothing open and nothing to toggle", () => {
        render();
        expect(s.text()).toContain("Skin type");
        expect(s.text()).toContain("Team only");
        expect(s.text()).toContain("Asked for products in Serums");
        expect(s.text()).toContain("3 products");
        expect(s.text()).toContain("Fabric care");
        expect(s.text()).toContain("Yes / no");
        expect(s.text()).toContain("On the shop");
        expect(s.text()).toContain("In no category, so no product asks for it");
        expect(s.inputs()).toHaveLength(0);
        expect(s.sheet()).toBe(null);
        expect(document.querySelector('[role="radio"]')).toBe(null);
        expect(document.querySelector("[aria-pressed]")).toBe(null);
        expect(s.button("Add field")).toBeDefined();
        expect(s.button("Edit Skin type")).toBeDefined();
        expect(s.button("Delete Skin type")).toBeDefined();
    });

    it("has no actions for a role that can only read", () => {
        render([SKIN], false);
        expect(s.text()).toContain("Your role can read these settings");
        expect(s.button("Add field")).toBeUndefined();
        expect(s.button("Edit Skin type")).toBeUndefined();
        expect(s.button("Delete Skin type")).toBeUndefined();
    });

    it("says none yet, with the one way to add one", () => {
        render([]);
        expect(s.text()).toContain("No custom fields yet");
        expect(
            Array.from(document.querySelectorAll("button")).filter(
                (b) => b.textContent.trim() === "Add field",
            ),
        ).toHaveLength(1);
    });

    it("deletes with Undo, keeping what was typed on products", async () => {
        actions.removeField.mockResolvedValue({ ok: true, data: {} });
        render();
        s.press("Delete Skin type");
        await s.settle();
        expect(actions.removeField).toHaveBeenCalledWith("f1");
        expect(showUndo.mock.calls[0][0]).toBe(
            "Skin type deleted. Values already typed on products are kept for 30 days.",
        );
    });
});

describe("Add field", () => {
    function open() {
        render();
        s.press("Add field");
        return s.inputs(s.sheet())[0];
    }

    it("opens a sheet named Add field: name, type, who, where", () => {
        const input = open();
        expect(s.title(s.sheet())).toBe("Add field");
        expect(input.value).toBe("");
        expect(radio("Text")?.getAttribute("aria-checked")).toBe("true");
        expect(radio("Team only")?.getAttribute("aria-checked")).toBe("true");
        expect(pressed("Serums")?.getAttribute("aria-pressed")).toBe("false");
        expect(s.button("Add field", s.sheet())).toBeDefined();
    });

    it("adds a plain field in one call, closes, and the list shows it", async () => {
        const made = { ...SKIN, id: "f3", name: "Finish", categoryIds: [] };
        actions.addField.mockResolvedValue({ ok: true, data: made });
        s.type(open(), " Finish ");
        act(() => radio("Number")?.click());
        await s.submit(s.sheet());
        expect(actions.addField).toHaveBeenCalledWith("Finish", "NUMBER");
        expect(actions.updateField).not.toHaveBeenCalled();
        expect(s.sheet()).toBe(null);
        expect(showUndo.mock.calls[0][0]).toBe("Finish added.");
        render([SKIN, CARE, made]);
        expect(s.text()).toContain("Finish");
    });

    it("sets who sees it and where it applies in the same sheet", async () => {
        const made = {
            ...SKIN,
            id: "f3",
            name: "Finish",
            onShop: false,
            categoryIds: [],
        };
        actions.addField.mockResolvedValue({ ok: true, data: made });
        actions.updateField.mockResolvedValue({ ok: true, data: made });
        s.type(open(), "Finish");
        act(() => radio("On the shop")?.click());
        act(() => pressed("Dresses")?.click());
        await s.submit(s.sheet());
        expect(actions.updateField).toHaveBeenCalledWith("f3", {
            onShop: true,
            categoryIds: ["c2"],
        });
        expect(s.sheet()).toBe(null);
    });

    it("keeps what was typed when the server refuses", async () => {
        actions.addField.mockResolvedValue({ ok: false, error: "Plan full." });
        s.type(open(), "Finish");
        await s.submit(s.sheet());
        expect(showError).toHaveBeenCalledWith("Plan full.");
        expect(s.inputs(s.sheet())[0].value).toBe("Finish");
    });

    it("carries on as an edit when only the second step is refused", async () => {
        const made = { ...SKIN, id: "f3", name: "Finish", categoryIds: [] };
        actions.addField.mockResolvedValue({ ok: true, data: made });
        actions.updateField.mockResolvedValueOnce({ ok: false, error: "No." });
        actions.updateField.mockResolvedValue({ ok: true, data: made });
        s.type(open(), "Finish");
        act(() => pressed("Serums")?.click());
        await s.submit(s.sheet());
        expect(showError).toHaveBeenCalledWith("No.");
        expect(s.sheet()).not.toBe(null);
        await s.submit(s.sheet());
        // Not added twice.
        expect(actions.addField).toHaveBeenCalledTimes(1);
        expect(actions.updateField).toHaveBeenCalledTimes(2);
        expect(s.sheet()).toBe(null);
    });

    it("refuses a name that is taken, too long or empty, unsent", async () => {
        const input = open();
        await s.submit(s.sheet());
        expect(s.sheet()?.textContent).toContain("A field needs a name.");
        s.type(input, "skin type");
        expect(s.sheet()?.textContent).toContain(
            "There is already a field called skin type.",
        );
        s.type(input, "x".repeat(41));
        expect(s.sheet()?.textContent).toContain(
            "Keep it under 40 characters.",
        );
        await s.submit(s.sheet());
        expect(actions.addField).not.toHaveBeenCalled();
    });
});

describe("Edit", () => {
    function open() {
        render();
        s.press("Edit Skin type");
        return s.inputs(s.sheet())[0];
    }

    it("opens the same sheet with what is saved; the card stays a card", () => {
        const input = open();
        expect(s.title(s.sheet())).toBe("Edit field");
        expect(input.value).toBe("Skin type");
        expect(radio("Team only")?.getAttribute("aria-checked")).toBe("true");
        expect(pressed("Serums")?.getAttribute("aria-pressed")).toBe("true");
        expect(s.sheet()?.textContent).toContain("can't be changed");
        expect(s.button("Delete Skin type")).toBeDefined();
        expect(s.inputs()).toHaveLength(1);
    });

    it("saves only what changed, with one call", async () => {
        actions.updateField.mockResolvedValue({ ok: true, data: SKIN });
        open();
        act(() => pressed("Dresses")?.click());
        expect(actions.updateField).not.toHaveBeenCalled();
        await s.submit(s.sheet());
        expect(actions.updateField).toHaveBeenCalledTimes(1);
        expect(actions.updateField).toHaveBeenCalledWith("f1", {
            categoryIds: ["c1", "c2"],
        });
        expect(s.sheet()).toBe(null);
        expect(showUndo.mock.calls[0][0]).toBe("Skin type saved.");
    });

    it("says where it shows when that is all that changed", async () => {
        actions.updateField.mockResolvedValue({ ok: true, data: SKIN });
        open();
        act(() => radio("On the shop")?.click());
        await s.submit(s.sheet());
        expect(actions.updateField).toHaveBeenCalledWith("f1", {
            onShop: true,
        });
        expect(showUndo.mock.calls[0][0]).toBe(
            "Skin type now shows on the shop.",
        );
    });

    it("keeps the draft when the server refuses", async () => {
        actions.updateField.mockResolvedValue({ ok: false, error: "No." });
        s.type(open(), "Skin");
        await s.submit(s.sheet());
        expect(showError).toHaveBeenCalledWith("No.");
        expect(s.inputs(s.sheet())[0].value).toBe("Skin");
    });

    it("drops the draft on Cancel, and closes unsent when unchanged", async () => {
        s.type(open(), "Skin");
        s.press("Cancel", s.sheet());
        expect(s.sheet()).toBe(null);
        s.press("Edit Skin type");
        expect(s.inputs(s.sheet())[0].value).toBe("Skin type");
        await s.submit(s.sheet());
        expect(actions.updateField).not.toHaveBeenCalled();
        expect(s.sheet()).toBe(null);
        expect(showUndo).not.toHaveBeenCalled();
    });
});

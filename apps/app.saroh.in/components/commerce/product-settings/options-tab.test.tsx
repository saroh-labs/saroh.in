// @vitest-environment jsdom
/**
 * Product settings › Options, read first: each option as a card with its
 * values and nothing to type in; New option and Edit open the one side
 * sheet, where the name and the values are changed together and saved
 * once. A value a variant uses can't be taken off. A refusal keeps what
 * was typed; a save puts it away.
 */
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CatalogueView } from "@/lib/products/settings";

import { OptionsTab } from "./options-tab";
import { stage } from "./test-kit";

const actions = {
    addOption: vi.fn(),
    renameOption: vi.fn(),
    removeOption: vi.fn(),
    addOptionValue: vi.fn(),
    removeOptionValue: vi.fn(),
    renameOptionValue: vi.fn(),
    reorderOptionValues: vi.fn(),
};
vi.mock("@/lib/products/settings-actions", () => ({
    addOption: (...a: unknown[]) => actions.addOption(...a) as unknown,
    renameOption: (...a: unknown[]) => actions.renameOption(...a) as unknown,
    removeOption: (...a: unknown[]) => actions.removeOption(...a) as unknown,
    addOptionValue: (...a: unknown[]) =>
        actions.addOptionValue(...a) as unknown,
    removeOptionValue: (...a: unknown[]) =>
        actions.removeOptionValue(...a) as unknown,
    renameOptionValue: (...a: unknown[]) =>
        actions.renameOptionValue(...a) as unknown,
    reorderOptionValues: (...a: unknown[]) =>
        actions.reorderOptionValues(...a) as unknown,
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

type Option = CatalogueView["options"][number];
const SIZE: Option = {
    id: "o1",
    name: "Size",
    productCount: 2,
    values: [
        { id: "v1", value: "250g", variantCount: 2 },
        { id: "v2", value: "500g", variantCount: 0 },
    ],
};
const SHADE: Option = { id: "o2", name: "Shade", productCount: 0, values: [] };

function catalogue(options: Option[], canWrite = true): CatalogueView {
    return {
        categories: [],
        uncategorizedCount: 0,
        options,
        defaults: {
            entries: {},
            stillOnDefault: {},
            productCounts: {},
            suggestions: [],
        },
        canWrite,
    };
}

const s = stage();
const render = (options: Option[] = [SIZE, SHADE], canWrite = true) =>
    s.render(<OptionsTab catalogue={catalogue(options, canWrite)} />);
const fields = () => s.inputs(s.sheet());
/** The field a new value is typed in. */
const newValue = () =>
    fields().find((i) =>
        i.getAttribute("aria-label")?.startsWith("Add a value"),
    );
/** The draft's values, in order, as their fields hold them. */
const values = () =>
    fields()
        .filter((i) => i.getAttribute("aria-label")?.startsWith("Value "))
        .map((i) => i.value);
/** Types a value and adds it to the sheet's draft. */
function addValue(v: string) {
    s.type(newValue(), v);
    s.press("Add value", s.sheet());
}

beforeEach(() => {
    s.mount();
    for (const m of [...Object.values(actions), refresh, showError, showUndo])
        m.mockReset();
});
afterEach(() => s.unmount());

describe("the list", () => {
    it("reads each option and its values with nothing to type in", () => {
        render();
        expect(s.text()).toContain("Size");
        expect(s.text()).toContain("2 products");
        expect(s.text()).not.toContain("Used by");
        // The count opens the products choosing by it.
        expect(
            document.querySelector('a[href="/commerce/products?option=o1"]')
                ?.textContent,
        ).toBe("2 products");
        expect(s.text()).toContain("Not on any product");
        expect(s.text()).toContain("A product picks one of these.");
        expect(s.text()).toContain("250g");
        expect(s.text()).toContain("500g");
        expect(s.text()).toContain("No values yet");
        expect(s.inputs()).toHaveLength(0);
        expect(s.sheet()).toBe(null);
        expect(s.button("New option")).toBeDefined();
        expect(s.button("Edit Size")).toBeDefined();
        // No value is removed from the card.
        expect(s.button("Remove 500g")).toBeUndefined();
        // One a product chooses by offers no Delete; its count says why.
        expect(s.button("Delete Size")).toBeUndefined();
        expect(s.button("Delete Shade")?.disabled).toBe(false);
    });

    it("has no actions for a role that can only read", () => {
        render([SIZE], false);
        expect(s.text()).toContain("You can see these but not change them");
        expect(s.text()).toContain("250g");
        for (const name of ["New option", "Edit Size", "Delete Size"])
            expect(s.button(name)).toBeUndefined();
    });

    it("says none yet, with the one way to add one", () => {
        render([]);
        expect(s.text()).toContain("No options yet");
        expect(
            Array.from(document.querySelectorAll("button")).filter(
                (b) => b.textContent.trim() === "New option",
            ),
        ).toHaveLength(1);
    });

    it("deletes an unused option, with Undo", async () => {
        actions.removeOption.mockResolvedValue({
            ok: true,
            data: { id: "o2", name: "Shade", values: [] },
        });
        render();
        s.press("Delete Shade");
        await s.settle();
        expect(actions.removeOption).toHaveBeenCalledWith("o2");
        expect(showUndo.mock.calls[0][0]).toBe("Shade deleted.");
    });
});

describe("New option", () => {
    function open() {
        render();
        s.press("New option");
    }

    it("opens a sheet named New option: its name and its values", () => {
        open();
        expect(s.title(s.sheet())).toBe("New option");
        expect(s.sheet()?.textContent).toContain(
            "A product picks one of these. For size and colour together",
        );
        expect(fields()).toHaveLength(2);
        expect(fields()[0].value).toBe("");
        expect(s.sheet()?.textContent).toContain("No values yet");
    });

    it("adds the option with its values in one call, and closes", async () => {
        actions.addOption.mockResolvedValue({ ok: true, data: { id: "o3" } });
        open();
        s.type(fields()[0], " Grind ");
        addValue("Whole bean");
        // A value still in the field goes in with the rest.
        s.type(newValue(), "Espresso");
        expect(actions.addOption).not.toHaveBeenCalled();
        await s.submit(s.sheet());
        expect(actions.addOption).toHaveBeenCalledWith("Grind", [
            "Whole bean",
            "Espresso",
        ]);
        expect(s.sheet()).toBe(null);
        expect(showUndo.mock.calls[0][0]).toBe("Grind added.");
        render([
            SIZE,
            SHADE,
            { id: "o3", name: "Grind", productCount: 0, values: [] },
        ]);
        expect(s.text()).toContain("Grind");
    });

    it("keeps what was typed when the server refuses", async () => {
        actions.addOption.mockResolvedValue({ ok: false, error: "Plan full." });
        open();
        s.type(fields()[0], "Grind");
        addValue("Whole bean");
        await s.submit(s.sheet());
        expect(showError).toHaveBeenCalledWith("Plan full.");
        expect(fields()[0].value).toBe("Grind");
        expect(values()).toEqual(["Whole bean"]);
    });

    it("refuses a name that is taken, too long or empty, unsent", async () => {
        open();
        await s.submit(s.sheet());
        expect(s.sheet()?.textContent).toContain("An option needs a name.");
        // A field in error drops its placeholder, which would read as typed.
        expect(fields()[0].placeholder).toBe("");
        s.type(fields()[0], "size");
        expect(s.sheet()?.textContent).toContain("Size already exists.");
        s.type(fields()[0], "x".repeat(41));
        expect(s.sheet()?.textContent).toContain(
            "Keep it under 40 characters.",
        );
        await s.submit(s.sheet());
        expect(actions.addOption).not.toHaveBeenCalled();
    });

    it("refuses a value twice or too long, in the sheet", () => {
        open();
        s.type(fields()[0], "Grind");
        addValue("Fine");
        addValue("fine");
        expect(s.sheet()?.textContent).toContain("Fine is already a value.");
        s.type(newValue(), "x".repeat(41));
        s.press("Add value", s.sheet());
        expect(s.sheet()?.textContent).toContain(
            "Keep a value under 40 characters.",
        );
    });
});

describe("Edit", () => {
    function open() {
        render();
        s.press("Edit Size");
    }

    it("opens the sheet with the name and values; the card stays a card", () => {
        open();
        expect(s.title(s.sheet())).toBe("Edit Size");
        expect(fields()[0].value).toBe("Size");
        expect(values()).toEqual(["250g", "500g"]);
        // The one variants use says how many and has no Remove.
        expect(s.sheet()?.textContent).toContain("2 variants");
        expect(s.button("Remove 250g", s.sheet())).toBeUndefined();
        expect(s.button("Remove 500g", s.sheet())).toBeDefined();
        expect(s.button("Edit Shade")).toBeDefined();
    });

    it("saves the name and the values together, on Save only", async () => {
        actions.renameOption.mockResolvedValue({ ok: true, data: {} });
        actions.removeOptionValue.mockResolvedValue({ ok: true, data: {} });
        actions.addOptionValue.mockResolvedValue({
            ok: true,
            data: { id: "v3", value: "1kg" },
        });
        open();
        s.type(fields()[0], "Weight");
        s.press("Remove 500g", s.sheet());
        addValue("1kg");
        expect(values()).toEqual(["250g", "1kg"]);
        for (const m of Object.values(actions))
            expect(m).not.toHaveBeenCalled();
        await s.submit(s.sheet());
        expect(actions.renameOption).toHaveBeenCalledWith("o1", "Weight");
        expect(actions.removeOptionValue).toHaveBeenCalledWith("o1", "v2");
        expect(actions.addOptionValue).toHaveBeenCalledWith("o1", "1kg");
        expect(s.sheet()).toBe(null);
        expect(showUndo.mock.calls[0][0]).toBe(
            "Size is now Weight. Customers see the new name.",
        );
    });

    it("stays open with the draft when a step is refused", async () => {
        actions.addOptionValue.mockResolvedValue({
            ok: false,
            error: "That value can't be added.",
        });
        open();
        addValue("1kg");
        await s.submit(s.sheet());
        expect(showError).toHaveBeenCalledWith("That value can't be added.");
        expect(values()).toEqual(["250g", "500g", "1kg"]);
        expect(showUndo).not.toHaveBeenCalled();
    });

    it("brings back a value taken off, rather than adding it twice", async () => {
        open();
        s.press("Remove 500g", s.sheet());
        addValue("500G");
        expect(s.button("Remove 500g", s.sheet())).toBeDefined();
        await s.submit(s.sheet());
        for (const m of Object.values(actions))
            expect(m).not.toHaveBeenCalled();
        expect(s.sheet()).toBe(null);
    });

    it("drops the draft on Cancel", () => {
        open();
        s.type(fields()[0], "Weight");
        s.press("Remove 500g", s.sheet());
        s.press("Cancel", s.sheet());
        expect(s.sheet()).toBe(null);
        for (const m of Object.values(actions))
            expect(m).not.toHaveBeenCalled();
        s.press("Edit Size");
        expect(fields()[0].value).toBe("Size");
        expect(s.button("Remove 500g", s.sheet())).toBeDefined();
    });

    it("adds a value on Enter without saving the sheet", () => {
        open();
        s.type(newValue(), "1kg");
        const e = new KeyboardEvent("keydown", {
            key: "Enter",
            bubbles: true,
            cancelable: true,
        });
        act(() => {
            newValue()?.dispatchEvent(e);
        });
        expect(e.defaultPrevented).toBe(true);
        expect(s.button("Remove 1kg", s.sheet())).toBeDefined();
        expect(actions.addOptionValue).not.toHaveBeenCalled();
        expect(s.sheet()).not.toBe(null);
    });
});

describe("Rename and order values", () => {
    function open() {
        render();
        s.press("Edit Size");
    }
    const valueField = (i: number) =>
        fields().filter((x) =>
            x.getAttribute("aria-label")?.startsWith("Value "),
        )[i];

    it("renames a value in use where it stands, on Save, with Undo", async () => {
        actions.renameOptionValue.mockResolvedValue({
            ok: true,
            data: {
                id: "v1",
                value: "250 g",
                previousValue: "250g",
                variantCount: 2,
            },
        });
        open();
        s.type(valueField(0), "250 g");
        expect(actions.renameOptionValue).not.toHaveBeenCalled();
        await s.submit(s.sheet());
        expect(actions.renameOptionValue).toHaveBeenCalledWith(
            "o1",
            "v1",
            "250 g",
        );
        expect(actions.reorderOptionValues).not.toHaveBeenCalled();
        expect(showUndo.mock.calls[0][0]).toBe(
            "Size saved. Renamed on 2 variants.",
        );
        // Undo renames it back.
        actions.renameOptionValue.mockResolvedValue({ ok: true, data: {} });
        const undo = showUndo.mock.calls[0][1] as () => Promise<unknown>;
        await act(async () => {
            await undo();
        });
        expect(actions.renameOptionValue).toHaveBeenLastCalledWith(
            "o1",
            "v1",
            "250g",
        );
    });

    it("refuses an empty or doubled value on Save, unsent", async () => {
        open();
        s.type(valueField(0), " ");
        await s.submit(s.sheet());
        expect(s.sheet()?.textContent).toContain("A value can't be empty.");
        s.type(valueField(0), "500G");
        await s.submit(s.sheet());
        expect(s.sheet()?.textContent).toContain("500g is there twice.");
        expect(actions.renameOptionValue).not.toHaveBeenCalled();
    });

    it("sorts A to Z, reading numbers as numbers, and saves the order", async () => {
        actions.reorderOptionValues.mockResolvedValue({ ok: true, data: {} });
        render([
            {
                ...SIZE,
                values: [
                    { id: "a", value: "1 L", variantCount: 0 },
                    { id: "b", value: "250 ml", variantCount: 0 },
                    { id: "c", value: "50 ml", variantCount: 0 },
                ],
            },
        ]);
        s.press("Edit Size");
        s.press("Sort A to Z", s.sheet());
        expect(values()).toEqual(["1 L", "50 ml", "250 ml"]);
        await s.submit(s.sheet());
        expect(actions.reorderOptionValues).toHaveBeenCalledWith("o1", [
            "a",
            "c",
            "b",
        ]);
    });

    it("moves a value with the arrow keys on its handle", () => {
        open();
        const handle = s.button(
            "Move 500g, 2 of 2. Use the up and down arrows.",
            s.sheet(),
        );
        act(() => {
            handle?.dispatchEvent(
                new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }),
            );
        });
        expect(values()).toEqual(["500g", "250g"]);
    });
});

// @vitest-environment jsdom
/**
 * Product settings › Allergens, read first: the list with nothing open,
 * and Add allergen opening a one-field dialog. A refusal keeps what was
 * typed; a save puts it away.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AllergenView } from "@/lib/products/settings";

import { AllergensTab } from "./allergens-tab";
import { stage } from "./test-kit";

const addAllergens = vi.fn();
const removeAllergen = vi.fn();
vi.mock("@/lib/products/settings-actions", () => ({
    addAllergens: (...a: unknown[]) => addAllergens(...a) as unknown,
    removeAllergen: (...a: unknown[]) => removeAllergen(...a) as unknown,
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
vi.mock("@saroh/ui/dialog", async () =>
    (await import("./test-kit")).dialogMock(),
);

const LIST: AllergenView[] = [
    { id: "a1", name: "Milk", contains: 2, mayContain: 1 },
    { id: "a2", name: "Sesame", contains: 0, mayContain: 0 },
];

const s = stage();
const render = (allergens = LIST, canWrite = true) =>
    s.render(<AllergensTab allergens={allergens} canWrite={canWrite} />);

beforeEach(() => {
    s.mount();
    for (const m of [
        addAllergens,
        removeAllergen,
        refresh,
        showError,
        showUndo,
    ])
        m.mockReset();
});
afterEach(() => s.unmount());

describe("the list", () => {
    it("shows each allergen with nothing open", () => {
        render();
        expect(s.text()).toContain("Milk");
        expect(s.text()).toContain("Contains: 2 · May contain: 1");
        expect(s.text()).toContain("Not on any product yet");
        expect(s.inputs()).toHaveLength(0);
        expect(s.dialog()).toBe(null);
        expect(s.button("Add allergen")).toBeDefined();
        // One on a product can't be removed, and says why.
        expect(
            s.button("Milk is on 3 products — take it off them first")
                ?.disabled,
        ).toBe(true);
        expect(s.button("Remove Sesame")?.disabled).toBe(false);
    });

    it("has no actions for a role that can only read", () => {
        render(LIST, false);
        expect(s.text()).toContain("Your role can read these settings");
        expect(s.button("Add allergen")).toBeUndefined();
        expect(s.button("Remove Sesame")).toBeUndefined();
    });

    it("says none yet, with both ways to start", async () => {
        addAllergens.mockResolvedValue({ ok: true, data: [] });
        render([]);
        expect(s.text()).toContain("No allergens yet");
        expect(s.button("Add allergen")).toBeDefined();
        s.press("Add the common food allergens");
        await s.settle();
        expect(addAllergens.mock.calls[0][0]).toHaveLength(8);
        expect(showUndo.mock.calls[0][0]).toBe(
            "The common food allergens are on the list.",
        );
    });

    it("says none yet without buttons for a role that can only read", () => {
        render([], false);
        expect(s.text()).toContain("No allergens yet");
        expect(s.button("Add allergen")).toBeUndefined();
        expect(s.button("Add the common food allergens")).toBeUndefined();
    });

    it("removes one no product lists, with Undo", async () => {
        removeAllergen.mockResolvedValue({ ok: true, data: {} });
        render();
        s.press("Remove Sesame");
        await s.settle();
        expect(removeAllergen).toHaveBeenCalledWith("a2");
        expect(showUndo.mock.calls[0][0]).toBe("Sesame removed from the list.");
    });
});

describe("Add allergen", () => {
    function open() {
        render();
        s.press("Add allergen");
        return s.inputs(s.dialog())[0];
    }

    it("opens a dialog named Add allergen with the one field", () => {
        const input = open();
        expect(s.title(s.dialog())).toBe("Add allergen");
        expect(s.inputs(s.dialog())).toHaveLength(1);
        expect(input.value).toBe("");
    });

    it("adds it, closes, and the list shows it", async () => {
        const celery = { id: "a3", name: "Celery", contains: 0, mayContain: 0 };
        addAllergens.mockResolvedValue({ ok: true, data: [...LIST, celery] });
        s.type(open(), " Celery ");
        await s.submit(s.dialog());
        expect(addAllergens).toHaveBeenCalledWith(["Celery"]);
        expect(s.dialog()).toBe(null);
        expect(refresh).toHaveBeenCalled();
        expect(showUndo.mock.calls[0][0]).toBe(
            "Celery added. The editor offers it now.",
        );
        render([...LIST, celery]);
        expect(s.text()).toContain("Celery");
    });

    it("keeps what was typed when the server refuses", async () => {
        addAllergens.mockResolvedValue({ ok: false, error: "Not just now." });
        s.type(open(), "Celery");
        await s.submit(s.dialog());
        expect(showError).toHaveBeenCalledWith("Not just now.");
        expect(s.inputs(s.dialog())[0].value).toBe("Celery");
    });

    it("refuses one already listed, too long or empty, unsent", async () => {
        const input = open();
        await s.submit(s.dialog());
        expect(s.dialog()?.textContent).toContain("An allergen needs a name.");
        s.type(input, "milk");
        expect(s.dialog()?.textContent).toContain(
            "milk is already on the list.",
        );
        s.type(input, "x".repeat(31));
        expect(s.dialog()?.textContent).toContain(
            "Keep it under 30 characters.",
        );
        await s.submit(s.dialog());
        expect(addAllergens).not.toHaveBeenCalled();
    });

    it("drops the draft on Cancel", () => {
        s.type(open(), "Celery");
        s.press("Cancel", s.dialog());
        expect(s.dialog()).toBe(null);
        expect(addAllergens).not.toHaveBeenCalled();
        s.press("Add allergen");
        expect(s.inputs(s.dialog())[0].value).toBe("");
    });
});

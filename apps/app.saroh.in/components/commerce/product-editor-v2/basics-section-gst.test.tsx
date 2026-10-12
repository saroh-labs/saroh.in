// @vitest-environment jsdom
/**
 * The product editor's Basics, "GST on this price" (12 Oct 2026): a
 * GST-registered business can price one product differently from its usual
 * way. The select is not drawn unless the business is known to be
 * registered; its first option says what the business's own way is; and
 * the choice is saved with the rest of Basics, null for "same as the
 * business".
 *
 * `react-dom/client` + `act` directly, as the other component tests do.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { GstPriceMode } from "@/lib/gst/price-mode";
import type { ProductDetail } from "@/lib/products/service";

import { BasicsSection } from "./basics-section";
import { ProductEditorProvider } from "./editor-state";

const patchProduct = vi.fn();
vi.mock("@/lib/products/actions", () => ({
    patchProduct: (...args: unknown[]) => patchProduct(...args) as unknown,
    createCategory: vi.fn(),
}));

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));

const showError = vi.fn();
vi.mock("@saroh/ui/toast", () => ({
    showSuccess: vi.fn(),
    showError: (...args: unknown[]) => showError(...args) as unknown,
}));

// The category picker opens a popover of its own; it isn't under test.
vi.mock("./category-picker", () => ({
    CategoryPicker: () => null,
}));

// A native select stands in for the product's, which opens a portal.
vi.mock("@saroh/ui/option-select", () => ({
    OptionSelect: ({
        id,
        value,
        onValueChange,
        options,
        placeholder,
        disabled,
    }: {
        id?: string;
        value: string;
        onValueChange: (v: string) => void;
        options: { value: string; label: string }[];
        placeholder?: string;
        disabled?: boolean;
    }) => (
        <select
            id={id}
            value={value}
            disabled={disabled}
            onChange={(e) => onValueChange(e.target.value)}
        >
            {placeholder ? <option value="">{placeholder}</option> : null}
            {options.map((o) => (
                <option key={o.value} value={o.value}>
                    {o.label}
                </option>
            ))}
        </select>
    ),
}));

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    patchProduct.mockReset();
    patchProduct.mockResolvedValue({ ok: true, data: {} });
    showError.mockReset();
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
});

const product = (over: Partial<ProductDetail> = {}) =>
    ({
        id: "p1",
        storeId: "s1",
        name: "Vitamin C serum",
        slug: "vitamin-c-serum",
        price: "1000.00",
        mrp: null,
        categoryId: null,
        currency: "INR",
        status: "PUBLISHED",
        gstRate: "18.00",
        hsnCode: null,
        gstPriceMode: null,
        ...over,
    }) as ProductDetail;

interface Page {
    /** Known to be registered. */
    registered?: boolean;
    businessPriceMode?: GstPriceMode | null;
    product?: ProductDetail;
    canWrite?: boolean;
}

function render(page: Page = {}) {
    const { registered = true, businessPriceMode = "INCLUDED" } = page;
    act(() =>
        root.render(
            <ProductEditorProvider
                mode="edit"
                canWrite={page.canWrite ?? true}
                canStock
                sellsFood={false}
            >
                <BasicsSection
                    product={page.product ?? product()}
                    storeId="s1"
                    currency="INR"
                    gstRegistered={registered}
                    gstRateNeeded={registered}
                    businessPriceMode={businessPriceMode}
                    categories={[]}
                    manageCategoriesHref="/commerce/products/settings"
                />
            </ProductEditorProvider>,
        ),
    );
}

async function settle() {
    for (let i = 0; i < 5; i++) {
        await act(async () => {
            await new Promise((r) => setTimeout(r, 0));
        });
    }
}

const modeSelect = () =>
    host.querySelector<HTMLSelectElement>("select#pe-gst-mode");

async function choose(value: string) {
    const box = modeSelect();
    if (!box) throw new Error("No GST on this price select");
    act(() => {
        Object.getOwnPropertyDescriptor(
            HTMLSelectElement.prototype,
            "value",
        )?.set?.call(box, value);
        box.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await settle();
}

async function save() {
    const button = Array.from(host.querySelectorAll("button")).find(
        (b) => b.textContent.trim() === "Save basics",
    );
    if (!button) throw new Error("No Save basics");
    await act(async () => {
        button.click();
        await Promise.resolve();
    });
    await settle();
}

const labels = () =>
    Array.from(modeSelect()?.options ?? []).map((o) => o.textContent);

/** What the last save sent for the price's way of carrying GST. */
const sent = () =>
    (patchProduct.mock.calls.at(-1)?.[2] as { gstPriceMode?: unknown })
        .gstPriceMode;

describe("GST on this price", () => {
    it("is not drawn for a business that isn't registered, and nothing is said of GST", () => {
        render({ registered: false, businessPriceMode: null });
        expect(modeSelect()).toBeNull();
        expect(host.textContent).not.toContain("GST on this price");
        expect(host.textContent).not.toContain("GST is added");
    });

    it("says what the business's own way is in its first option", () => {
        render({ businessPriceMode: "INCLUDED" });
        expect(
            host.querySelector('label[for="pe-gst-mode"]')?.textContent,
        ).toContain("GST on this price");
        expect(labels()).toEqual([
            "Same as the business (includes GST)",
            "Includes GST",
            "GST is added",
        ]);
        expect(modeSelect()?.value).toBe("");
        render({ businessPriceMode: "ADDED" });
        expect(labels()[0]).toBe("Same as the business (GST is added)");
        // Couldn't be read: no claim either way.
        render({ businessPriceMode: null });
        expect(labels()[0]).toBe("Same as the business");
    });

    it("opens on the product's own way when it has one", () => {
        render({ product: product({ gstPriceMode: "ADDED" }) });
        expect(modeSelect()?.value).toBe("ADDED");
    });

    it("saves GST is added with the rest of Basics", async () => {
        render();
        await choose("ADDED");
        await save();
        expect(patchProduct).toHaveBeenCalledTimes(1);
        expect(patchProduct.mock.calls[0]?.slice(0, 2)).toEqual(["s1", "p1"]);
        expect(sent()).toBe("ADDED");
        // The rate goes with it, as it always did.
        expect(patchProduct.mock.calls[0]?.[2]).toMatchObject({
            gstRate: "18",
            price: "1000",
        });
    });

    it("saves Includes GST, and null to go back to the business's way", async () => {
        render({ product: product({ gstPriceMode: "ADDED" }) });
        await choose("INCLUDED");
        await save();
        expect(sent()).toBe("INCLUDED");
        await choose("");
        await save();
        expect(sent()).toBeNull();
    });

    it("is off for someone who can't change products", () => {
        render({ canWrite: false });
        expect(modeSelect()?.disabled).toBe(true);
    });
});

/**
 * GST is part of MRP (12 Oct 2026): where GST is added to this price, the
 * MRP's own line says the amount to pay, and an MRP under that amount is
 * said in place, before Save and when the API refuses.
 */
describe("the amount to pay beside the MRP", () => {
    /** The MRP field: its label's own wrapper. */
    const mrpField = () =>
        host
            .querySelector('label[for="pe-mrp"]')
            ?.closest('[data-slot="field"]') ?? null;
    const mrpHint = () =>
        mrpField()?.querySelector('[data-slot="field-hint"]')?.textContent ??
        null;
    const mrpError = () =>
        mrpField()?.querySelector('[data-slot="field-error"]')?.textContent ??
        null;
    const OVER =
        "With 18% GST added this is ₹1,180 to pay, more than its MRP of ₹1,100. Lower the price, raise the MRP, or set this product's price to include GST.";

    it("says what one costs to pay where the business adds GST: ₹1,000 + 18% is ₹1,180", () => {
        render({ businessPriceMode: "ADDED" });
        expect(mrpHint()).toBe(
            "The printed price, which includes GST. ₹1,180 to pay with 18% GST, so the MRP can't be lower.",
        );
        expect(mrpError()).toBeNull();
    });

    it("says it for a product set to GST is added on its own, and not for one set to Includes GST", () => {
        render({
            businessPriceMode: "INCLUDED",
            product: product({ gstPriceMode: "ADDED" }),
        });
        expect(mrpHint()).toContain("₹1,180 to pay with 18% GST");
        render({
            businessPriceMode: "ADDED",
            product: product({ gstPriceMode: "INCLUDED" }),
        });
        expect(mrpHint()).toBe(
            "The printed price, shown struck through. Leave it empty if it sells at MRP.",
        );
    });

    it("changes nothing while prices include GST, or for a business that isn't registered", () => {
        render({ businessPriceMode: "INCLUDED" });
        expect(mrpHint()).toBe(
            "The printed price, shown struck through. Leave it empty if it sells at MRP.",
        );
        expect(host.textContent).not.toContain("to pay");
        // ₹1,000 against an MRP of ₹1,100 is fine as it always was.
        render({
            businessPriceMode: "INCLUDED",
            product: product({ mrp: "1100.00" }),
        });
        expect(mrpError()).toBeNull();
        render({
            registered: false,
            businessPriceMode: null,
            product: product({ mrp: "1100.00" }),
        });
        expect(mrpError()).toBeNull();
        expect(host.textContent).not.toContain("to pay");
    });

    it("says an MRP under the amount to pay in place, with the sums, and not one at exactly that amount", () => {
        render({
            businessPriceMode: "ADDED",
            product: product({ mrp: "1100.00" }),
        });
        expect(mrpError()).toBe(OVER);
        render({
            businessPriceMode: "ADDED",
            product: product({ mrp: "1180.00" }),
        });
        expect(mrpError()).toBeNull();
        render({
            businessPriceMode: "ADDED",
            product: product({ mrp: "1200.00" }),
        });
        expect(mrpError()).toBeNull();
    });

    it("says it as soon as this product is set to GST is added", async () => {
        render({
            businessPriceMode: "INCLUDED",
            product: product({ mrp: "1100.00" }),
        });
        expect(mrpError()).toBeNull();
        await choose("ADDED");
        expect(mrpError()).toBe(OVER);
        await choose("INCLUDED");
        expect(mrpError()).toBeNull();
    });

    it("puts the API's refusal under the MRP, not in a toast", async () => {
        // The form sees nothing wrong with what it holds; the API, which
        // has the last word, refuses on the MRP.
        patchProduct.mockResolvedValue({
            ok: false,
            error: OVER,
            field: "mrp",
        });
        render({
            businessPriceMode: null,
            product: product({ mrp: "1100.00" }),
        });
        expect(mrpError()).toBeNull();
        await choose("INCLUDED");
        expect(mrpError()).toBeNull();
        await save();
        expect(patchProduct).toHaveBeenCalledTimes(1);
        expect(mrpError()).toBe(OVER);
        expect(showError).not.toHaveBeenCalled();
    });
});

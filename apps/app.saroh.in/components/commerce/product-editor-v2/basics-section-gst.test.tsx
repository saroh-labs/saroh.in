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

vi.mock("@saroh/ui/toast", () => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
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

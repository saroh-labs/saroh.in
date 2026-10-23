// @vitest-environment jsdom
/**
 * The product editor after the products audit (16 Oct 2026):
 * - "Create draft" is never off: pressed on an empty form it marks Name and
 *   Price and takes the keyboard to Name, and creates nothing;
 * - a live product whose How to use was saved over the limit opens with a
 *   held note, not a red field, and the rest of the section still saves
 *   without it;
 * - a SKU the API refuses (another product has it) is said under that
 *   row's SKU box, not on the section's bar.
 *
 * `react-dom/client` + `act` directly, as the other component tests do.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ProductDetail, ProductOptionView } from "@/lib/products/service";

import { VariantsSection } from "@/components/commerce/product-variants/variants-section";
import { DetailsSection } from "./details-section";
import { ProductEditorV2 } from "./editor-shell";
import { ProductEditorProvider, useEditor } from "./editor-state";

const createProduct = vi.fn();
const patchProduct = vi.fn();
const createVariant = vi.fn();
vi.mock("@/lib/products/actions", () => ({
    createProduct: (...args: unknown[]) => createProduct(...args) as unknown,
    patchProduct: (...args: unknown[]) => patchProduct(...args) as unknown,
    createVariant: (...args: unknown[]) => createVariant(...args) as unknown,
    deleteVariant: vi.fn(),
    updateVariant: vi.fn(),
    reorderVariants: vi.fn(),
    listProductAt: vi.fn(),
    unlistProductAt: vi.fn(),
    createCategory: vi.fn(),
}));
vi.mock("@/lib/products/settings-actions", () => ({
    effectiveDefaults: vi.fn(() => Promise.resolve(null)),
}));
vi.mock("@/lib/products/path-actions", () => ({
    suggestProductPath: vi.fn(() =>
        Promise.resolve({ path: "packing-tape-2", holder: "Packing Tape" }),
    ),
}));
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/components/billing/plan-refusal", () => ({
    showPlanRefusal: vi.fn(),
}));
const showErrorToast = vi.fn();
vi.mock("@saroh/ui/toast", () => ({
    showError: vi.fn(),
    showErrorToast: (...args: unknown[]) => showErrorToast(...args) as unknown,
    dismissToast: vi.fn(),
    showSuccess: vi.fn(),
    showUndo: vi.fn(),
}));
// Sections not under test, and the pickers that open portals.
vi.mock("./description-section", () => ({ DescriptionSection: () => null }));
vi.mock("./made-by-section", () => ({ MadeBySection: () => null }));
vi.mock("./photos-section", () => ({ PhotosSection: () => null }));
vi.mock("./category-picker", () => ({ CategoryPicker: () => null }));
vi.mock("@/components/commerce/product-variants/option-values-inline", () => ({
    OptionValuesInline: () => null,
}));
vi.mock("@saroh/ui/option-select", () => ({
    OptionSelect: ({
        value,
        onValueChange,
        options,
        "aria-label": label,
    }: {
        value: string;
        onValueChange: (v: string) => void;
        options: { value: string; label: string }[];
        "aria-label"?: string;
    }) => (
        <select
            aria-label={label}
            value={value}
            onChange={(e) => onValueChange(e.target.value)}
        >
            <option value="">Pick</option>
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
    createProduct.mockReset();
    patchProduct.mockReset();
    createVariant.mockReset();
    showErrorToast.mockReset();
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
});

const product = (over: Partial<ProductDetail> = {}) =>
    ({
        id: "p1",
        storeId: "s1",
        name: "Henna Cream",
        slug: "henna-cream",
        price: "420.00",
        mrp: null,
        categoryId: null,
        currency: "INR",
        status: "PUBLISHED",
        gstRate: null,
        hsnCode: null,
        gstPriceMode: null,
        howToUse: null,
        materials: null,
        shopFields: {},
        fulfilmentTypes: [],
        allergens: { contains: [], mayContain: [] },
        variants: [],
        images: [],
        optionId: "opt-shade",
        category: null,
        ...over,
    }) as unknown as ProductDetail;

const button = (name: string) =>
    Array.from(host.querySelectorAll("button")).find(
        (b) => b.textContent.trim() === name,
    );

const text = () => host.textContent;

function type(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
    const proto =
        el instanceof HTMLTextAreaElement
            ? HTMLTextAreaElement.prototype
            : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
    act(() => {
        descriptor?.set?.call(el, value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
    });
}

describe("New product: Create draft", () => {
    function renderNew() {
        act(() =>
            root.render(
                <ProductEditorV2
                    product={null}
                    storeId="s1"
                    storeName="Northwind"
                    currency="INR"
                    gstRegistered={false}
                    categories={[]}
                    categoriesHref="/settings"
                    options={[]}
                    canWrite
                    canStock
                    viewerRole="Owner"
                    stores={[{ id: "s1", name: "Northwind" }]}
                    listings={null}
                    businessTracks
                    sku={{ pattern: "", suggest: false, n: 1 }}
                    allergens={[]}
                    defaults={null}
                />,
            ),
        );
    }

    it("is never off, and pressed early marks Name and Price and focuses Name", () => {
        renderNew();
        const create = button("Create draft");
        expect(create).toBeDefined();
        expect(create?.disabled).toBe(false);
        act(() => create?.click());
        expect(createProduct).not.toHaveBeenCalled();
        expect(text()).toContain("Add a name.");
        expect(text()).toContain("Add a price.");
        const name = host.querySelector<HTMLInputElement>("#pe-name");
        expect(name?.getAttribute("aria-invalid")).toBe("true");
        expect(document.activeElement).toBe(name);
    });

    it("shows the path it will really get when the name is taken", async () => {
        vi.useFakeTimers();
        try {
            renderNew();
            const name = host.querySelector<HTMLInputElement>("#pe-name");
            if (!name) throw new Error("no name box");
            type(name, "Packing Tape");
            await act(async () => {
                await vi.advanceTimersByTimeAsync(400);
            });
            expect(text()).toContain("packing-tape-2");
            expect(text()).toContain(
                "Packing Tape already uses packing-tape, so this one gets packing-tape-2.",
            );
            expect(text()).not.toMatch(/slug/i);
        } finally {
            vi.useRealTimers();
        }
    });
});

describe("How to use saved over the limit", () => {
    const long = "x".repeat(395);

    function renderDetails() {
        act(() =>
            root.render(
                <ProductEditorProvider
                    mode="edit"
                    canWrite
                    canStock
                    sellsFood={false}
                >
                    <DetailsSection
                        product={product({ howToUse: long })}
                        storeId="s1"
                        allergens={[]}
                        defaults={null}
                    />
                    <SaveDetails />
                </ProductEditorProvider>,
            ),
        );
    }

    function SaveDetails() {
        const { saveSections } = useEditor();
        return (
            <button
                type="button"
                onClick={() => void saveSections(["details"])}
            >
                Save details now
            </button>
        );
    }

    it("opens with a held note, not an error, in a 3-line box", () => {
        renderDetails();
        const box = host.querySelector<HTMLTextAreaElement>("#pe-how");
        expect(box?.tagName).toBe("TEXTAREA");
        expect(box?.rows).toBe(3);
        expect(box?.getAttribute("aria-invalid")).toBe("false");
        expect(text()).toContain(
            "395 characters. The shop shows 300. Shorten it when you next save.",
        );
        expect(host.querySelector('[role="alert"]')).toBeNull();
        expect(text()).not.toContain("Keep it under");
    });

    it("saves the rest of the section without the held line", async () => {
        patchProduct.mockResolvedValue({ ok: true, data: {} });
        renderDetails();
        const materials =
            host.querySelector<HTMLTextAreaElement>("#pe-materials");
        if (!materials) throw new Error("no materials box");
        type(materials, "Henna leaf");
        await act(async () => {
            button("Save details now")?.click();
            await Promise.resolve();
        });
        expect(patchProduct).toHaveBeenCalledTimes(1);
        const patch = patchProduct.mock.calls[0][2] as Record<string, unknown>;
        expect(patch.materials).toBe("Henna leaf");
        expect("howToUse" in patch).toBe(false);
    });

    it("becomes the limit again once the line is changed", () => {
        renderDetails();
        const box = host.querySelector<HTMLTextAreaElement>("#pe-how");
        if (!box) throw new Error("no how-to-use box");
        type(box, `${long}y`);
        expect(box.getAttribute("aria-invalid")).toBe("true");
        expect(text()).toContain(
            "Keep it under 300 characters. It is 396 now.",
        );
    });
});

describe("a SKU another product has", () => {
    const shade: ProductOptionView = {
        id: "opt-shade",
        name: "Shade",
        values: [{ id: "v-brown", value: "Brown" }],
    } as ProductOptionView;

    function Save() {
        const { saveSections } = useEditor();
        return (
            <button
                type="button"
                onClick={() => void saveSections(["variants"])}
            >
                Save variants now
            </button>
        );
    }

    it("is said under the row's SKU box, not on the bar", async () => {
        createVariant.mockResolvedValue({
            ok: false,
            error: "PT-BRN is already Packing Tape · Brown.",
            field: "sku",
        });
        act(() =>
            root.render(
                <ProductEditorProvider
                    mode="edit"
                    canWrite
                    canStock
                    sellsFood={false}
                >
                    <VariantsSection
                        product={product()}
                        storeId="s1"
                        currency="INR"
                        options={[shade]}
                        sku={{ pattern: "", suggest: false, n: 1 }}
                        stores={[{ id: "s1", name: "Northwind" }]}
                        listings={null}
                    />
                    <Save />
                </ProductEditorProvider>,
            ),
        );
        act(() => button("Add variants")?.click());
        const pick = host.querySelector<HTMLSelectElement>(
            'select[aria-label="New variant shade"]',
        );
        if (!pick) throw new Error("no value picker");
        act(() => {
            pick.value = "v-brown";
            pick.dispatchEvent(new Event("change", { bubbles: true }));
        });
        const skuBox = host.querySelector<HTMLInputElement>(
            'input[aria-label="New variant SKU"]',
        );
        if (!skuBox) throw new Error("no SKU box");
        type(skuBox, "PT-BRN");
        act(() => button("Add to list")?.click());
        await act(async () => {
            button("Save variants now")?.click();
            await Promise.resolve();
            await Promise.resolve();
        });
        expect(createVariant).toHaveBeenCalledTimes(1);
        const alert = host.querySelector('li [role="alert"]');
        expect(alert?.textContent).toBe(
            "PT-BRN is already Packing Tape · Brown.",
        );
        const rowSku = host.querySelector<HTMLInputElement>(
            'input[aria-label="Variant 1 SKU"]',
        );
        expect(rowSku?.getAttribute("aria-invalid")).toBe("true");
        // Not a toast, and not the bar's failure line.
        expect(showErrorToast).not.toHaveBeenCalled();
        expect(text()).not.toContain("Your changes are still here");
    });
});

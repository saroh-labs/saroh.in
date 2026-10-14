// @vitest-environment jsdom
/**
 * The product editor's Variants at the plan's cap on one product's variants
 * (DEC-158). At the cap "Add to list" is off and the line beside it says
 * the cap and where more is; under it nothing changes; a product already
 * past it keeps every row, editable and removable, and is told so; and
 * someone who can't change the plan reads who can instead of a link. A
 * create the API's plan refuses is shown as the plan's notice.
 *
 * `react-dom/client` + `act` directly, as the other component tests do.
 * Numbers are made up.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PlanAccessProvider } from "@/components/billing/plan-way";
import type { PlanRefusal } from "@/lib/billing/refusal";
import type { VariantCap } from "@/lib/billing/variant-cap";
import type { ProductDetail, ProductOptionView } from "@/lib/products/service";

import { ProductEditorProvider, useEditor } from "./editor-state";
import { VariantsSection } from "./variants-section";

const createVariant = vi.fn();
vi.mock("@/lib/products/actions", () => ({
    createVariant: (...args: unknown[]) => createVariant(...args) as unknown,
    deleteVariant: vi.fn(),
    updateVariant: vi.fn(),
    reorderVariants: vi.fn(),
    patchProduct: vi.fn(),
    listProductAt: vi.fn(),
    unlistProductAt: vi.fn(),
}));

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));

const showPlanRefusal = vi.fn();
vi.mock("@/components/billing/plan-refusal", () => ({
    showPlanRefusal: (...args: unknown[]) =>
        showPlanRefusal(...args) as unknown,
}));

vi.mock("@saroh/ui/toast", () => ({
    showError: vi.fn(),
    showUndo: vi.fn(),
    showSuccess: vi.fn(),
}));

// The inline "add a value" form talks to Settings; it isn't under test.
vi.mock("./option-values-inline", () => ({
    OptionValuesInline: () => null,
}));

// A native select stands in for the product's, which opens a portal.
vi.mock("@saroh/ui/option-select", () => ({
    OptionSelect: ({
        value,
        onValueChange,
        options,
        disabled,
        "aria-label": label,
    }: {
        value: string;
        onValueChange: (v: string) => void;
        options: { value: string; label: string; disabled?: boolean }[];
        disabled?: boolean;
        "aria-label"?: string;
    }) => (
        <select
            aria-label={label}
            value={value}
            disabled={disabled}
            onChange={(e) => onValueChange(e.target.value)}
        >
            <option value="">Pick</option>
            {options.map((o) => (
                <option key={o.value} value={o.value} disabled={o.disabled}>
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
    createVariant.mockReset();
    showPlanRefusal.mockReset();
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
});

const SIZES = ["XS", "S", "M", "L", "XL", "XXL"];
const option: ProductOptionView = {
    id: "opt_size",
    name: "Size",
    productCount: 1,
    values: SIZES.map((value) => ({
        id: `val_${value}`,
        value,
        variantCount: 0,
    })),
};

/** A product with its first `n` sizes as variants. */
const product = (n: number) =>
    ({
        id: "p1",
        storeId: "s1",
        name: "Linen shirt",
        slug: "linen-shirt",
        price: "1000.00",
        mrp: null,
        category: null,
        currency: "INR",
        gstRate: null,
        gstPriceMode: null,
        optionId: option.id,
        images: [],
        variants: SIZES.slice(0, n).map((size, position) => ({
            id: `v_${size}`,
            productId: "p1",
            sku: `LS-${size}`,
            title: size,
            price: null,
            image: null,
            optionValueId: `val_${size}`,
            position,
        })),
    }) as unknown as ProductDetail;

const cap = (over: Partial<VariantCap> = {}): VariantCap => ({
    limit: 3,
    plan: "Plan A",
    upgradeTo: "Plan B",
    uncapped: false,
    href: "/settings/billing/plans?plan=b",
    ...over,
});

/** Saves the section the way the header's Save all does. */
function SaveAll() {
    const { saveSections } = useEditor();
    return (
        <button type="button" onClick={() => void saveSections(["variants"])}>
            Save variants
        </button>
    );
}

function render(
    variants: number,
    variantCap: VariantCap | null,
    canChangePlan = true,
) {
    act(() =>
        root.render(
            <PlanAccessProvider canChangePlan={canChangePlan}>
                <ProductEditorProvider
                    mode="edit"
                    canWrite
                    canStock
                    sellsFood={false}
                >
                    <VariantsSection
                        product={product(variants)}
                        storeId="s1"
                        currency="INR"
                        options={[option]}
                        sku={{ pattern: "{NAME}-{VALUE}", suggest: true, n: 1 }}
                        stores={[{ id: "s1", name: "Hill Road" }]}
                        listings={null}
                        variantCap={variantCap}
                    />
                    <SaveAll />
                </ProductEditorProvider>
            </PlanAccessProvider>,
        ),
    );
}

const button = (name: string) =>
    Array.from(host.querySelectorAll("button")).find(
        (b) => b.textContent.trim() === name,
    );
const rowsShown = () => host.querySelectorAll("ol > li").length;
const pick = (value: string) => {
    const select = host.querySelector<HTMLSelectElement>(
        'select[aria-label="New variant size"]',
    );
    if (!select) throw new Error("no value select");
    act(() => {
        select.value = value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
    });
};

const AT_CAP =
    "You can have up to 3 variants a product on Plan A. No more can be added to this one. Plan B allows more.";

describe("Variants at the plan's cap (DEC-158)", () => {
    it("says nothing of a plan while there is room, and adds as before", () => {
        render(2, cap());
        expect(host.textContent).not.toContain("You can have up to");
        expect(host.querySelector('a[href^="/settings/billing"]')).toBeNull();
        pick("val_M");
        expect(button("Add to list")?.disabled).toBe(false);
    });

    it("says nothing of a plan with no cap", () => {
        render(6, null);
        expect(host.textContent).not.toContain("You can have up to");
        expect(rowsShown()).toBe(6);
    });

    it("turns Add to list off at the cap, and says the cap and where more is", () => {
        render(3, cap());
        expect(host.textContent).toContain(AT_CAP);
        const link = host.querySelector<HTMLAnchorElement>(
            'a[href="/settings/billing/plans?plan=b"]',
        );
        expect(link?.textContent).toBe("See Plan B");
        // A value still to be had doesn't turn the button back on.
        pick("val_L");
        expect(button("Add to list")?.disabled).toBe(true);
        // Every row is still there to edit and remove.
        expect(rowsShown()).toBe(3);
    });

    it("reaches the cap on the staged list, before any save", () => {
        render(2, cap());
        pick("val_M");
        act(() => button("Add to list")?.click());
        expect(rowsShown()).toBe(3);
        expect(host.textContent).toContain(AT_CAP);
        expect(createVariant).not.toHaveBeenCalled();
    });

    it("has 6, cap 3: keeps every row, says it keeps them, and adds none", () => {
        render(6, cap());
        expect(rowsShown()).toBe(6);
        expect(host.textContent).toContain(
            "You can have up to 3 variants a product on Plan A. No more can be added to this one. It keeps the 6 it has. Plan B allows more.",
        );
        expect(button("Add to list")?.disabled).toBe(true);
        // Its rows stay editable: the SKU boxes aren't locked.
        const skus = host.querySelectorAll<HTMLInputElement>(
            'ol input[aria-label$="SKU"]',
        );
        expect(skus.length).toBe(6);
        skus.forEach((input) => expect(input.disabled).toBe(false));
    });

    it("tells someone who can't change the plan who can, with no link", () => {
        render(3, cap(), false);
        expect(host.textContent).toContain(AT_CAP);
        expect(host.textContent).toContain(
            "The owner can change the plan in Settings › Plan and billing.",
        );
        expect(host.querySelector('a[href^="/settings/billing"]')).toBeNull();
    });

    it("shows the plan's notice when the API's plan refuses a new variant", async () => {
        const refusal: PlanRefusal = {
            code: "PLAN_LIMIT_REACHED",
            title: "You can have up to 3 variants a product on Plan A",
            body: "No more can be added to this one. Plan B allows more.",
            cta: "See plans",
            upgradeTo: { planId: "b", name: "Plan B", pricePaise: 11_100 },
            limit: 3,
            used: 3,
        };
        createVariant.mockResolvedValue({
            ok: false,
            error: refusal.title,
            plan: refusal,
        });
        // The screen couldn't read the plan (no cap passed): the API still
        // refuses, and the refusal is the notice.
        render(3, null);
        pick("val_L");
        act(() => button("Add to list")?.click());
        await act(async () => {
            button("Save variants")?.click();
            await Promise.resolve();
        });
        await act(async () => {
            await Promise.resolve();
        });
        expect(createVariant).toHaveBeenCalledTimes(1);
        expect(showPlanRefusal).toHaveBeenCalledWith(refusal);
        // The row it couldn't save is still in the list.
        expect(rowsShown()).toBe(4);
    });
});

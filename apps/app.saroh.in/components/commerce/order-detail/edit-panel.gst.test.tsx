// @vitest-environment jsdom
/**
 * Order Detail's "Add an item" under "GST is added" (12 Oct 2026): what the
 * sheet says the customer owes is the amount to pay, with the GST on top of
 * the typed price, as the API will charge the line. Where prices include
 * GST, or the business isn't registered, it is the typed price as before.
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { formatMoney } from "@/lib/format/money";
import type { PriceTerms } from "@/lib/gst/price-mode";
import type { EditOrderInput } from "@/lib/orders/kitchen-service";
import type { OrderReadLine } from "@/lib/orders/read";
import { sellablesOf } from "@/lib/orders/sellables";

import { EditPanel } from "./edit-panel";

// The product's select opens a portal jsdom can't press: a native select
// stands in, with the same options and wiring.
vi.mock("@saroh/ui/option-select", () => ({
    OptionSelect: ({
        value,
        onValueChange,
        options,
        placeholder,
    }: {
        value: string;
        onValueChange: (v: string) => void;
        options: { value: string; label: string; disabled?: boolean }[];
        placeholder?: string;
    }) => (
        <select
            aria-label="Add an item"
            value={value}
            onChange={(e) => onValueChange(e.target.value)}
        >
            <option value="">{placeholder}</option>
            {options.map((o) => (
                <option key={o.value} value={o.value} disabled={o.disabled}>
                    {o.label}
                </option>
            ))}
        </select>
    ),
}));

const PRODUCTS = [
    { id: "serum", name: "Vitamin C serum", price: "1000.00", gstRate: "18" },
    { id: "soap", name: "Neem soap", price: "200.00", gstRate: null },
];

const LINE = {
    id: "li_1",
    name: "Face wash",
    variantTitle: null,
    quantity: 1,
    price: "590.00",
} as unknown as OrderReadLine;

const ADDED: PriceTerms = { registered: true, mode: "ADDED" };
const INCLUDED: PriceTerms = { registered: true, mode: "INCLUDED" };

let root: Root;
let host: HTMLDivElement;
const onSave = vi.fn<(input: EditOrderInput) => void>();

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    onSave.mockReset();
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
    document.body.innerHTML = "";
});

function open(terms?: PriceTerms) {
    act(() =>
        root.render(
            <EditPanel
                open
                number="#1063"
                first="Asha"
                lines={[LINE]}
                address={null}
                delivery={false}
                refundTo="the till"
                format={(amount) =>
                    formatMoney(Math.round(amount * 100), "INR")
                }
                addable={sellablesOf(PRODUCTS, terms)}
                busy={false}
                onCancel={vi.fn()}
                onSave={onSave}
            />,
        ),
    );
}

function add(key: string) {
    const box = document.querySelector<HTMLSelectElement>(
        'select[aria-label="Add an item"]',
    );
    if (!box) throw new Error("No Add an item");
    act(() => {
        Object.getOwnPropertyDescriptor(
            HTMLSelectElement.prototype,
            "value",
        )?.set?.call(box, key);
        box.dispatchEvent(new Event("change", { bubbles: true }));
    });
}

const page = () => document.body.textContent;
const options = () =>
    Array.from(
        document.querySelectorAll('select[aria-label="Add an item"] option'),
    ).map((o) => o.textContent);

describe("Add an item, where GST is added to prices", () => {
    it("offers each product at its amount to pay", () => {
        open(ADDED);
        expect(options()).toEqual([
            "Choose a product…",
            "Vitamin C serum · ₹1,180",
            // No rate on it: nothing is added.
            "Neem soap · ₹200",
        ]);
    });

    it("says what the customer owes with the GST on top, and saves by that", () => {
        open(ADDED);
        add("serum");
        expect(page()).toContain("Vitamin C serum · added");
        expect(page()).toContain(
            "Asha owes ₹1,180 more. It shows as due on the order. Nothing is sent to Asha.",
        );
        expect(page()).toContain("Save (₹1,180 more due)");
        expect(page()).not.toContain("₹1,000");
    });

    it("adds up what was picked at each one's amount to pay", () => {
        open(ADDED);
        add("serum");
        add("soap");
        expect(page()).toContain("Asha owes ₹1,380 more.");
    });

    it("sends only what was picked, never a price", () => {
        open(ADDED);
        add("serum");
        const save = Array.from(document.querySelectorAll("button")).find(
            (b) => b.textContent.trim() === "Save (₹1,180 more due)",
        );
        if (!save) throw new Error("No Save");
        act(() => save.click());
        expect(onSave).toHaveBeenCalledWith({
            add: [{ productId: "serum", quantity: 1 }],
        });
    });
});

describe("Add an item, where the typed price is the amount to pay", () => {
    it("is the typed price where prices include GST", () => {
        open(INCLUDED);
        expect(options()).toContain("Vitamin C serum · ₹1,000");
        add("serum");
        expect(page()).toContain("Asha owes ₹1,000 more.");
    });

    it("is the typed price for a business that isn't registered, or wasn't read", () => {
        open();
        add("serum");
        expect(page()).toContain("Asha owes ₹1,000 more.");
    });
});

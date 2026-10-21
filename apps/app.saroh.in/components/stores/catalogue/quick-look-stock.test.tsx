// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { catalogueRows } from "@/lib/products/catalogue";
import { catalogueProduct } from "@/lib/products/catalogue.fixture";

import { StockBlock, waitingOrdersHref } from "./quick-look-stock";

/**
 * A short product's alert in the stock quick look (U5, #1136): it never
 * asks for something the screen gives no way to do. Saroh doesn't tell the
 * customers itself, so it links the open orders with the product — where
 * each can be told — and only for someone who can open them.
 */

vi.mock("@/lib/products/list-actions", () => ({ addQuickStock: vi.fn() }));
vi.mock("@saroh/ui/toast", () => ({
    showError: vi.fn(),
    showSuccess: vi.fn(),
}));
vi.mock("next/link", () => ({
    default: ({
        href,
        children,
        className,
    }: {
        href: string;
        children?: ReactNode;
        className?: string;
    }) => (
        <a href={href} className={className}>
            {children}
        </a>
    ),
}));

/** Two promised, none on hand: two short at Hill Road. */
function shortLoaf() {
    const [row] = catalogueRows([
        catalogueProduct({
            id: "loaf",
            variantCount: 0,
            inventory: { quantity: 0, promised: 2, lowStockAlert: 5 },
            listings: [
                {
                    storeId: "hill",
                    storeName: "Hill Road",
                    inventory: { quantity: 0, promised: 2, lowStockAlert: 5 },
                    variants: [],
                },
            ],
        }),
    ]);
    return row;
}

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
    (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});

afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = "";
});

function render(canStock: boolean, canOrders: boolean) {
    act(() =>
        root.render(
            <dl>
                <StockBlock
                    row={shortLoaf()}
                    storeId="hill"
                    canStock={canStock}
                    canOrders={canOrders}
                    need={null}
                    onChanged={() => undefined}
                />
            </dl>,
        ),
    );
}

describe("a short product's alert (U5)", () => {
    it("links the open orders with it, where the customers can be told", () => {
        render(true, true);
        const text = host.textContent;
        expect(text).toMatch(/Add stock below\./);
        expect(text).toMatch(
            /If an order will be late, open it to tell the customer\./,
        );
        const link = Array.from(host.querySelectorAll("a")).find(
            (a) => a.textContent === "Open orders with it",
        );
        expect(link?.getAttribute("href")).toBe(
            "/commerce/orders?tab=open&storefront=hill&product=loaf",
        );
    });

    it("asks nothing it can't be done from here, without the orders", () => {
        render(true, false);
        const text = host.textContent;
        expect(text).toMatch(/Add stock below\./);
        expect(text).not.toMatch(/tell/i);
        expect(host.querySelector("a")).toBeNull();
    });

    it("someone who can't count stock is told who can", () => {
        render(false, false);
        const text = host.textContent;
        expect(text).toMatch(/Someone who counts stock can add it\./);
        expect(text).not.toMatch(/tell the customers/i);
    });
});

describe("waitingOrdersHref", () => {
    it("names the storefront only when one is in view", () => {
        expect(waitingOrdersHref("loaf", null)).toBe(
            "/commerce/orders?tab=open&product=loaf",
        );
    });
});

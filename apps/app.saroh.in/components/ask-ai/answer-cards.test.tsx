// @vitest-environment jsdom
/**
 * The cards under an answer (14 Nov): products as a grid of small cards,
 * a cover only from Saroh's media host, each card linking to the product;
 * a table with "+N more" and its Open in link; app routes only.
 */
import type { AskAiInfoCard } from "@saroh/api-contract";
import { act } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
    default: ({
        href,
        children,
        className,
    }: {
        href: string;
        children: React.ReactNode;
        className?: string;
    }) => (
        <a href={href} className={className}>
            {children}
        </a>
    ),
}));

import nextConfig from "../../next.config.js";
import {
    AnswerCard,
    MEDIA_ORIGINS,
    mediaSrc,
    phoneLayout,
} from "./answer-cards";

const item = (id: string, imageUrl: string | null) => ({
    id,
    name: `Sourdough ${id}`,
    imageUrl,
    price: "INR 180.00",
    sold: 12,
    amount: "INR 2160.00",
    stock: 4,
    href: `/commerce/products/${id}`,
});

const PRODUCTS: AskAiInfoCard = {
    kind: "products",
    data: {
        title: "Best sellers, 1 Nov to 14 Nov",
        items: [
            item("p1", "https://media.saroh.in/org/p1.webp"),
            item("p2", "https://images.unsplash.com/photo-1"),
            item("p3", null),
        ],
        more: 2,
        link: { label: "Open in Insights", href: "/analytics?tab=sells" },
    },
};

const TABLE: AskAiInfoCard = {
    kind: "table",
    data: {
        title: "Unpaid bills",
        columns: ["Bill", "Customer", "Left to pay", "Due"],
        numeric: [2],
        rows: [["INV-1", "Asha", "INR 500.00", "13 days late"]],
        more: 4,
        link: {
            label: "Open in Invoices",
            href: "/billing/invoices?view=unpaid",
        },
    },
};

let root: Root;
let host: HTMLDivElement;
const render = (card: AskAiInfoCard) =>
    act(() => root.render(<AnswerCard card={card} />));
const hrefs = () =>
    Array.from(host.querySelectorAll("a")).map((a) => a.getAttribute("href"));

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

describe("products card", () => {
    it("draws each product as a card linking to it, with price, sold and stock", () => {
        render(PRODUCTS);
        expect(host.querySelectorAll("li")).toHaveLength(3);
        expect(hrefs()).toEqual([
            "/commerce/products/p1",
            "/commerce/products/p2",
            "/commerce/products/p3",
            "/analytics?tab=sells",
        ]);
        const first = host.querySelector("li")?.textContent ?? "";
        expect(first).toContain("Sourdough p1");
        expect(first).toContain("INR 180.00");
        expect(first).toContain("12 sold · INR 2160.00");
        expect(first).toContain("4 in stock");
        expect(host.textContent).toContain("+2 more");
    });

    it("shows only covers on Saroh's media host; any other is initials", () => {
        render(PRODUCTS);
        const srcs = Array.from(host.querySelectorAll("img")).map((i) =>
            i.getAttribute("src"),
        );
        expect(srcs).toEqual(["https://media.saroh.in/org/p1.webp"]);
        expect(mediaSrc("https://media.saroh.in.evil.com/x")).toBeNull();
        expect(mediaSrc("javascript:alert(1)")).toBeNull();
    });

    it("never links off the app", () => {
        render({
            kind: "products",
            data: {
                ...PRODUCTS.data,
                items: [{ ...item("p9", null), href: "https://evil.example" }],
                link: { label: "Open", href: "//evil.example" },
            },
        });
        expect(hrefs()).toEqual([]);
    });

    it("the media hosts are the ones the page's CSP lets images load from", async () => {
        const rules = (await nextConfig.headers?.()) ?? [];
        const csp =
            rules
                .flatMap((r) => r.headers)
                .find(
                    (h) =>
                        h.key.toLowerCase() ===
                        "content-security-policy-report-only",
                )?.value ?? "";
        const img = csp.split("; ").find((p) => p.startsWith("img-src ")) ?? "";
        for (const origin of MEDIA_ORIGINS) expect(img).toContain(origin);
    });
});

describe("table card", () => {
    it("draws the mini table with its heads, +N more and the Open in link", () => {
        render(TABLE);
        const heads = Array.from(
            host.querySelectorAll('[role="columnheader"]'),
        ).map((th) => th.textContent);
        expect(heads).toEqual(["Bill", "Customer", "Left to pay", "Due"]);
        const cells = Array.from(host.querySelectorAll('[role="cell"]')).map(
            (td) => td.textContent,
        );
        // On a phone "Due" folds under the customer (hidden at the desk).
        expect(cells).toEqual([
            "INV-1",
            "Asha13 days late",
            "INR 500.00",
            "13 days late",
        ]);
        expect(host.querySelectorAll('[role="cell"]')[2].className).toContain(
            "text-right",
        );
        expect(host.textContent).toContain("+4 more");
        expect(hrefs()).toEqual(["/billing/invoices?view=unpaid"]);
    });

    it("links each row's first cell to its own record, a real focusable link", () => {
        render({
            kind: "table",
            data: {
                ...TABLE.data,
                rows: [
                    ["INV-1", "Asha", "INR 500.00", "13 days late"],
                    ["INV-2", "Ravi", "INR 90.00", "2 days late"],
                ],
                hrefs: ["/billing/invoices/inv1", null],
                link: undefined,
            },
        });
        const rows = host.querySelectorAll('[role="rowgroup"] [role="row"]');
        const first = rows[0].querySelector('[role="cell"] a');
        expect(first?.getAttribute("href")).toBe("/billing/invoices/inv1");
        expect(first?.textContent).toBe("INV-1");
        // Only the first cell links; a row without a record has none.
        expect(rows[0].querySelectorAll("a")).toHaveLength(1);
        expect(rows[1].querySelectorAll("a")).toHaveLength(0);
    });

    it("never links a row off the app", () => {
        render({
            kind: "table",
            data: {
                title: "Orders",
                columns: ["Order"],
                rows: [["A"], ["B"], ["C"], ["D"]],
                hrefs: [
                    "https://evil.com",
                    "//evil.com",
                    "/\\evil.com",
                    "javascript:alert(1)",
                ],
            },
        });
        expect(hrefs()).toEqual([]);
    });
});

describe("table card on a phone", () => {
    it("orders keep number, customer and total; status and day fold under the customer", () => {
        const columns = ["Order", "Customer", "Total", "Status", "Placed"];
        const layout = phoneLayout(columns, new Set([2]));
        expect(layout.shown).toEqual([0, 1, 2]);
        expect(layout.folded).toEqual([3, 4]);
        expect(layout.host).toBe(1);
        // Three tracks for three columns: no sideways scroll.
        expect(layout.tracks).toBe(
            "fit-content(40%) minmax(0,1fr) max-content",
        );

        render({
            kind: "table",
            data: {
                title: "Orders",
                columns,
                numeric: [2],
                rows: [["ORD-1", "Asha", "₹500", "Paid", "12 Oct"]],
            },
        });
        const table = host.querySelector<HTMLElement>('[role="table"]');
        if (!table) throw new Error("no table");
        expect(table.className).not.toContain("min-w-max");
        expect(table.style.getPropertyValue("--phone")).toBe(layout.tracks);
        const heads = host.querySelectorAll('[role="columnheader"]');
        expect(heads[3].className).toContain("max-sm:hidden");
        expect(heads[2].className).not.toContain("max-sm:hidden");
        const cells = host.querySelectorAll('[role="cell"]');
        expect(cells[1].querySelector(".sm\\:hidden")?.textContent).toBe(
            "Paid · 12 Oct",
        );
        expect(cells[4].className).toContain("max-sm:hidden");
    });

    it("keeps figures, folding the rest with their names", () => {
        const layout = phoneLayout(
            ["Class", "Sessions", "Booked", "Places", "Full"],
            new Set([1, 2, 3, 4]),
        );
        expect(layout.shown).toEqual([0, 1, 2]);
        expect(layout.folded).toEqual([3, 4]);
        expect(layout.host).toBe(0);
        expect(layout.tracks).toBe("minmax(0,1fr) max-content max-content");
    });
});

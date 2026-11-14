import { describe, expect, it } from "vitest";

import {
    ASK_AI_CARD_ITEMS,
    askAiEvent,
    askAiInfoCard,
    askAiMessage,
} from "./ask-ai";

const table = {
    kind: "table",
    data: {
        title: "Unpaid bills",
        columns: ["Bill", "Customer"],
        rows: [["INV-1", "Asha"]],
        more: 3,
        link: { label: "Open in Invoices", href: "/billing/invoices" },
    },
};

const product = {
    id: "p1",
    name: "Sourdough",
    imageUrl: null,
    price: "INR 180.00",
    sold: 12,
    amount: null,
    stock: null,
    href: "/commerce/products/p1",
};

describe("Ask AI's answer cards", () => {
    it("parses a table and a products card, as an event and on a saved message", () => {
        expect(askAiInfoCard.parse(table)).toEqual(table);
        const products = {
            kind: "products",
            data: { title: "Best sellers", items: [product] },
        };
        expect(askAiInfoCard.parse(products)).toEqual(products);
        expect(askAiEvent.parse({ type: "card", ...table })).toMatchObject({
            kind: "table",
        });
        expect(
            askAiMessage.parse({
                id: "m1",
                role: "ASSISTANT",
                outcome: "ANSWERED",
                text: "Three bills.",
                cards: [table],
                createdAt: "2026-11-14T10:00:00Z",
            }).cards,
        ).toEqual([table]);
    });

    it("refuses an unknown kind and more items than a card shows", () => {
        expect(
            askAiInfoCard.safeParse({ kind: "chart", data: {} }).success,
        ).toBe(false);
        expect(
            askAiInfoCard.safeParse({
                kind: "products",
                data: {
                    title: "Products",
                    items: Array.from(
                        { length: ASK_AI_CARD_ITEMS + 1 },
                        () => product,
                    ),
                },
            }).success,
        ).toBe(false);
    });
});

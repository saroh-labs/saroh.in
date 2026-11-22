import { describe, expect, it } from "vitest";

import {
    ASK_AI_CARD_ITEMS,
    askAiEvent,
    askAiInfoCard,
    askAiMessage,
    askAiTurnBody,
    isAskAiStarter,
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

describe("Ask AI's page and common questions", () => {
    it("takes a question about a page, and refuses an unknown kind", () => {
        const about = { kind: "customer", id: "c1", label: "Kavya Menon" };
        expect(askAiTurnBody.parse({ question: "Hi", about }).about).toEqual(
            about,
        );
        expect(
            askAiTurnBody.safeParse({
                question: "Hi",
                about: { kind: "admin", label: "x" },
            }).success,
        ).toBe(false);
    });

    it("tells a common question by its words alone", () => {
        expect(isAskAiStarter("What's my busiest day this week?")).toBe(true);
        expect(isAskAiStarter("  What's my busiest day this week? ")).toBe(
            true,
        );
        expect(isAskAiStarter("What's my busiest day this year?")).toBe(false);
        expect(
            isAskAiStarter("How could this section's words be clearer?"),
        ).toBe(true);
    });

    it("takes a page, a section and a post of the website", () => {
        for (const about of [
            { kind: "site_page", id: "s1:p1", label: "Home page" },
            {
                kind: "site_section",
                id: "s1:p1:hero-1",
                label: "Home · Top of the page",
            },
            { kind: "post", id: "s1:post1", label: "Our new menu" },
        ]) {
            expect(
                askAiTurnBody.parse({ question: "Hi", about }).about,
            ).toEqual(about);
        }
    });
});

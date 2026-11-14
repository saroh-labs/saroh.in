/**
 * Ask AI's answer cards (14 Nov): built from a read tool's structured
 * result; a cover only from Saroh's own media host; the tool's omissions
 * for a role kept; at most eight items, the rest counted.
 */
jest.mock("@saroh/database", () => ({}));

import { askAiInfoCard } from "@saroh/api-contract";

import { answerCard, ownMediaUrl, productIdsOf } from "./answer-cards";

const MEDIA = "https://media.saroh.in";

describe("ownMediaUrl", () => {
    it("keeps a cover on the media host and drops every other", () => {
        expect(ownMediaUrl(`${MEDIA}/org/p.webp`, MEDIA)).toBe(
            `${MEDIA}/org/p.webp`,
        );
        expect(
            ownMediaUrl("https://images.unsplash.com/photo-1", MEDIA),
        ).toBeNull();
        expect(
            ownMediaUrl("https://media.saroh.in.evil.com/p", MEDIA),
        ).toBeNull();
        expect(ownMediaUrl("http://media.saroh.in/p.webp", MEDIA)).toBeNull();
        expect(ownMediaUrl("https://u:p@media.saroh.in/p", MEDIA)).toBeNull();
        expect(ownMediaUrl("javascript:alert(1)", MEDIA)).toBeNull();
        expect(ownMediaUrl(`${MEDIA}/p.webp`, undefined)).toBeNull();
        expect(ownMediaUrl(null, MEDIA)).toBeNull();
    });

    it("keeps to the base's own path when it has one", () => {
        const base = "https://cdn.example.com/saroh";
        expect(ownMediaUrl("https://cdn.example.com/saroh/a.png", base)).toBe(
            "https://cdn.example.com/saroh/a.png",
        );
        expect(
            ownMediaUrl("https://cdn.example.com/other/a.png", base),
        ).toBeNull();
    });
});

const seller = (i: number) => ({
    product_id: `p${i}`,
    name: `Product ${i}`,
    sold: 20 - i,
    sold_before: 0,
    amount: "INR 100.00",
});

describe("products card", () => {
    const selling = (n: number) => ({
        period: "this_month",
        from: "2026-11-01",
        to: "2026-11-14",
        best_sellers: Array.from({ length: n }, (_, i) => seller(i + 1)),
        last_sale_on: null,
        booked: [],
        busiest: null,
        quietest: null,
        customers: { total: 0, returning: 0, new: 0, best: [] },
        not_shown: [],
    });

    it("draws best sellers with their own cover, price and stock, linking to each product", () => {
        const facts = new Map([
            [
                "p1",
                {
                    image: `${MEDIA}/a.webp`,
                    price: "INR 180.00",
                    stock: 4,
                },
            ],
            [
                "p2",
                {
                    image: "https://images.unsplash.com/x",
                    price: "INR 90.00",
                    stock: null,
                },
            ],
        ]);
        const card = answerCard("get_whats_selling", selling(2), facts, MEDIA);
        expect(askAiInfoCard.parse(card)).toEqual(card);
        expect(card).toEqual({
            kind: "products",
            data: {
                title: "Best sellers, 1 Nov to 14 Nov",
                items: [
                    {
                        id: "p1",
                        name: "Product 1",
                        imageUrl: `${MEDIA}/a.webp`,
                        price: "INR 180.00",
                        sold: 19,
                        amount: "INR 100.00",
                        stock: 4,
                        href: "/commerce/products/p1",
                    },
                    {
                        id: "p2",
                        name: "Product 2",
                        imageUrl: null,
                        price: "INR 90.00",
                        sold: 18,
                        amount: "INR 100.00",
                        stock: null,
                        href: "/commerce/products/p2",
                    },
                ],
                link: {
                    label: "Open in Insights",
                    href: "/analytics?tab=sells",
                },
            },
        });
    });

    it("shows at most eight and counts the rest; nothing sold draws none", () => {
        const card = answerCard(
            "get_whats_selling",
            selling(11),
            new Map(),
            MEDIA,
        );
        expect(card?.kind === "products" && card.data.items).toHaveLength(8);
        expect(card?.data.more).toBe(3);
        expect(productIdsOf("get_whats_selling", selling(11))).toHaveLength(8);
        expect(
            answerCard("get_whats_selling", selling(0), new Map(), MEDIA),
        ).toBeNull();
    });

    it("without product facts (a role without products), no cover, price or stock", () => {
        const card = answerCard(
            "get_whats_selling",
            selling(1),
            new Map(),
            MEDIA,
        );
        expect(card?.kind === "products" && card.data.items[0]).toMatchObject({
            imageUrl: null,
            price: null,
            stock: null,
            sold: 19,
        });
    });
});

const bill = (i: number, over: Partial<Record<string, unknown>> = {}) => ({
    invoice_id: `inv${i}`,
    number: `INV-${i}`,
    customer: { untrusted: true as const, text: `Customer ${i}` },
    left_to_pay: "INR 500.00",
    due_on: "2026-11-01",
    days_late: 13,
    ...over,
});

describe("table card", () => {
    it("unpaid bills: who, what's left and how late, with +N more from the total and a link", () => {
        const card = answerCard(
            "list_unpaid_bills",
            {
                bills: Array.from({ length: 9 }, (_, i) => bill(i + 1)),
                total: 12,
                next_cursor: "9",
                not_shown: [],
            },
            new Map(),
            MEDIA,
        );
        expect(askAiInfoCard.parse(card)).toEqual(card);
        expect(card?.kind).toBe("table");
        if (card?.kind !== "table") return;
        expect(card.data.columns).toEqual(["Bill", "Customer", "Owed", "Due"]);
        expect(card.data.numeric).toEqual([2]);
        expect(card.data.rows[0]).toEqual([
            "INV-1",
            "Customer 1",
            "INR 500.00",
            "13 days late",
        ]);
        expect(card.data.rows).toHaveLength(8);
        expect(card.data.more).toBe(4);
        expect(card.data.link?.href).toBe("/billing/invoices?view=unpaid");
    });

    it("leaves out amounts a role doesn't see, and draws nothing for one without bills", () => {
        const card = answerCard(
            "list_unpaid_bills",
            {
                bills: [bill(1, { left_to_pay: null, days_late: 0 })],
                total: 1,
                next_cursor: null,
                not_shown: ["payments"],
            },
            new Map(),
            MEDIA,
        );
        if (card?.kind !== "table") throw new Error("no table");
        expect(card.data.columns).toEqual(["Bill", "Customer", "Due"]);
        expect(card.data.rows[0]).toEqual(["INV-1", "Customer 1", "Due 1 Nov"]);
        expect(card.data.more).toBeUndefined();
        expect(
            answerCard(
                "list_unpaid_bills",
                {
                    bills: null,
                    total: null,
                    next_cursor: null,
                    not_shown: ["bills"],
                },
                new Map(),
                MEDIA,
            ),
        ).toBeNull();
    });

    it("customers: no phone or email columns unless the tool gave them", () => {
        const person = {
            customer_id: "c1",
            name: { untrusted: true as const, text: "Asha" },
            last_seen_at: "2026-08-01T10:00:00.000Z",
            email: null,
            phone: null,
        };
        const plain = answerCard(
            "find_lapsed_customers",
            { days: 60, customers: [person], next_cursor: null },
            new Map(),
            MEDIA,
        );
        expect(plain?.kind === "table" && plain.data.columns).toEqual([
            "Customer",
            "Last seen",
        ]);
        const asked = answerCard(
            "find_lapsed_customers",
            {
                days: 60,
                customers: [{ ...person, phone: "+91 98000 00000" }],
                next_cursor: null,
            },
            new Map(),
            MEDIA,
        );
        expect(asked?.kind === "table" && asked.data.columns).toEqual([
            "Customer",
            "Last seen",
            "Phone",
        ]);
    });

    it("a tool with no card, or an empty list, draws none", () => {
        expect(answerCard("get_hours", {}, new Map(), MEDIA)).toBeNull();
        expect(
            answerCard(
                "list_orders",
                { orders: [], next_cursor: null },
                new Map(),
                MEDIA,
            ),
        ).toBeNull();
    });
});

/**
 * Ask AI's answer cards (14 Nov): built from a read tool's structured
 * result; a cover only from Saroh's own media host; the tool's omissions
 * for a role kept; at most eight items, the rest counted.
 */
jest.mock("@saroh/database", () => ({}));

import { askAiInfoCard } from "@saroh/api-contract";

import { totalLine } from "../../mcp/tools/v1-bridge";
import {
    answerCard,
    ordersHref,
    ownMediaUrl,
    productIdsOf,
} from "./answer-cards";
import { APP_LINKS, appLink, dateFilter } from "./app-links";

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
    amount: "₹100",
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
                    price: "₹180",
                    stock: 4,
                },
            ],
            [
                "p2",
                {
                    image: "https://images.unsplash.com/x",
                    price: "₹90",
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
                        price: "₹180",
                        sold: 19,
                        amount: "₹100",
                        stock: 4,
                        href: "/commerce/products/p1",
                    },
                    {
                        id: "p2",
                        name: "Product 2",
                        imageUrl: null,
                        price: "₹90",
                        sold: 18,
                        amount: "₹100",
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
    left_to_pay: "₹500",
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
            "₹500",
            "13 days late",
        ]);
        expect(card.data.rows).toHaveLength(8);
        expect(card.data.more).toBe(4);
        expect(card.data.link?.href).toBe("/billing/invoices?view=owed");
        // Each row opens its own bill, one href per row shown.
        expect(card.data.hrefs).toHaveLength(8);
        expect(card.data.hrefs?.[0]).toBe("/billing/invoices/inv1");
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

const span = {
    period: "last_3_months",
    timezone: "Asia/Kolkata",
    from: "2026-08-15",
    to: "2026-11-14",
    before_from: "2026-05-15",
    before_to: "2026-08-14",
};
const who = (text: string) => ({ untrusted: true as const, text });

describe("period summary cards", () => {
    it("orders: the newest, each row its order, linked to Orders filtered to the days", () => {
        const card = answerCard(
            "summarise_orders",
            {
                span,
                orders: 12,
                first: Array.from({ length: 8 }, (_, i) => ({
                    order_id: `o${i}`,
                    number: `ORD-${i}`,
                    customer: who("Asha"),
                    total: "₹900",
                    status: "DELIVERED",
                    placed_on: "2026-10-02",
                })),
            },
            new Map(),
            MEDIA,
        );
        expect(askAiInfoCard.parse(card)).toEqual(card);
        if (card?.kind !== "table") throw new Error("no table");
        expect(card.data.columns).toEqual([
            "Order",
            "Customer",
            "Total",
            "Status",
            "Placed",
        ]);
        expect(card.data.rows[0]).toEqual([
            "ORD-0",
            "Asha",
            "₹900",
            "Delivered",
            "2 Oct",
        ]);
        expect(card.data.more).toBe(4);
        expect(card.data.hrefs?.[7]).toBe("/commerce/orders/o7");
        expect(card.data.link?.href).toBe(
            "/commerce/orders?date=custom&from=2026-08-15&to=2026-11-14",
        );
    });

    it("invoices: rows open their invoice; the link keeps to a status tab the list has", () => {
        const first = [
            {
                invoice_id: "i1",
                number: "INV-1",
                customer: who("Ravi"),
                amount: null,
                status: "overdue",
                issued_on: "2026-10-01",
            },
        ];
        const card = answerCard(
            "summarise_invoices",
            {
                span,
                invoices: 1,
                by_status: [{ status: "overdue", count: 1, amount: null }],
                first,
            },
            new Map(),
            MEDIA,
        );
        if (card?.kind !== "table") throw new Error("no table");
        expect(card.data.columns).toEqual([
            "Bill",
            "Customer",
            "Status",
            "Issued",
        ]);
        expect(card.data.hrefs).toEqual(["/billing/invoices/i1"]);
        // The status's tab, issued in the period's exact days.
        expect(card.data.link?.href).toBe(
            "/billing/invoices?tab=overdue&date=custom&from=2026-08-15&to=2026-11-14",
        );
        const mixed = answerCard(
            "summarise_invoices",
            {
                span,
                invoices: 2,
                by_status: [
                    { status: "paid", count: 1, amount: null },
                    { status: "cancelled", count: 1, amount: null },
                ],
                first,
            },
            new Map(),
            MEDIA,
        );
        expect(mixed?.kind === "table" && mixed.data.link?.href).toBe(
            "/billing/invoices?date=custom&from=2026-08-15&to=2026-11-14",
        );
    });

    it("stock: products on hand, each row its product, linked to Stock", () => {
        const card = answerCard(
            "summarise_stock",
            {
                span,
                products: 3,
                top: [
                    {
                        product_id: "p1",
                        name: "Rose oil",
                        on_hand: 12,
                        value: "₹1,200",
                    },
                ],
            },
            new Map(),
            MEDIA,
        );
        if (card?.kind !== "table") throw new Error("no table");
        expect(card.data.rows[0]).toEqual(["Rose oil", "12", "₹1,200"]);
        expect(card.data.numeric).toEqual([1, 2]);
        expect(card.data.hrefs).toEqual(["/commerce/products/p1"]);
        expect(card.data.more).toBe(2);
        expect(card.data.link?.href).toBe("/commerce/stock?tab=levels");
    });

    it("bookings: rows open the booking; one day opens that day, a range the list", () => {
        const first = [
            {
                booking_id: "b1",
                when: "Thu 1 Oct, 10:00",
                service: "Haircut",
                customer: who("Mira"),
                status: "Came",
            },
        ];
        const card = answerCard(
            "summarise_bookings",
            { span, bookings: 1, cancelled: 0, first },
            new Map(),
            MEDIA,
        );
        if (card?.kind !== "table") throw new Error("no table");
        expect(card.data.hrefs).toEqual(["/bookings/b1"]);
        expect(card.data.link?.href).toBe(
            "/bookings/all?date=custom&from=2026-08-15&to=2026-11-14",
        );
        const day = answerCard(
            "summarise_bookings",
            {
                span: { ...span, from: "2026-11-14", to: "2026-11-14" },
                bookings: 1,
                cancelled: 0,
                first,
            },
            new Map(),
            MEDIA,
        );
        expect(day?.kind === "table" && day.data.link?.href).toBe(
            "/bookings/all?date=custom&from=2026-11-14&to=2026-11-14",
        );
    });

    it("row links are app routes only: an id can't make one leave the app", () => {
        const card = answerCard(
            "list_orders",
            {
                orders: [
                    {
                        order_id: "//evil.com",
                        number: "ORD-1",
                        created_at: "2026-10-01T00:00:00Z",
                        stage: "new",
                        payment_status: "paid",
                        total: "₹1",
                    },
                    {
                        order_id: "../../x y",
                        number: "ORD-2",
                        created_at: "2026-10-01T00:00:00Z",
                        stage: "new",
                        payment_status: "paid",
                        total: "₹1",
                    },
                ],
                next_cursor: null,
            },
            new Map(),
            MEDIA,
        );
        if (card?.kind !== "table") throw new Error("no table");
        for (const href of card.data.hrefs ?? []) {
            expect(href).toMatch(/^\/commerce\/orders\/[^/]+$/);
        }
        expect(card.data.hrefs?.[0]).toBe("/commerce/orders/%2F%2Fevil.com");
        expect(askAiInfoCard.parse(card)).toEqual(card);
        // The contract refuses anything that isn't an app route.
        for (const bad of [
            "https://evil.com",
            "//evil.com",
            "/\\evil.com",
            "javascript:alert(1)",
            "/a b",
        ]) {
            expect(
                askAiInfoCard.safeParse({
                    kind: "table",
                    data: {
                        title: "t",
                        columns: ["a"],
                        rows: [["x"]],
                        hrefs: [bad],
                    },
                }).success,
            ).toBe(false);
        }
    });
});

describe("class read cards", () => {
    it("class fill: each class's totals, linked to the calendar's week", () => {
        const card = answerCard(
            "get_class_fill",
            {
                span: {
                    period: "this_week",
                    timezone: "Asia/Kolkata",
                    from: "2026-11-09",
                    to: "2026-11-15",
                },
                booked: 60,
                places: 84,
                full_percent: 71,
                classes: [
                    {
                        service_id: "s1",
                        name: "7 AM Hatha",
                        capacity: 12,
                        sessions: 7,
                        places: 84,
                        booked: 60,
                        full_percent: 71,
                        session_list: [],
                    },
                ],
            },
            new Map(),
            MEDIA,
        );
        if (card?.kind !== "table") throw new Error("no table");
        expect(card.data.rows[0]).toEqual([
            "7 AM Hatha",
            "7",
            "60",
            "84",
            "71%",
        ]);
        expect(card.data.link?.href).toBe("/calendar?view=week&day=2026-11-09");
        expect(askAiInfoCard.parse(card)).toEqual(card);
    });

    it("waitlist: one row a person, in line, each opening the customer", () => {
        const card = answerCard(
            "list_waitlist",
            {
                people: 2,
                sessions: [
                    {
                        service_id: "s1",
                        service: "7 AM Hatha",
                        starts_at: "2026-11-21T01:30:00.000Z",
                        when: "Sat 21 Nov, 07:00",
                        waiting: [
                            {
                                position: 1,
                                customer_id: "c1",
                                name: who("Ira Sen"),
                                status: "waiting",
                                offered_until: null,
                            },
                            {
                                position: 2,
                                customer_id: "c2",
                                name: who("Kunal Shah"),
                                status: "offered",
                                offered_until: "Fri 20 Nov, 17:30",
                            },
                        ],
                    },
                ],
            },
            new Map(),
            MEDIA,
        );
        if (card?.kind !== "table") throw new Error("no table");
        expect(card.data.rows).toEqual([
            ["7 AM Hatha", "Sat 21 Nov, 07:00", "1", "Ira Sen", "Waiting"],
            [
                "7 AM Hatha",
                "Sat 21 Nov, 07:00",
                "2",
                "Kunal Shah",
                "Offered a place",
            ],
        ]);
        expect(card.data.hrefs).toEqual(["/contacts/c1", "/contacts/c2"]);
    });

    it("class packs: who, what's left and the use-by, the rest counted, linked to holders", () => {
        const card = answerCard(
            "list_class_packs",
            {
                span: {
                    period: "this_month",
                    from: "2026-11-01",
                    to: "2026-11-30",
                },
                total: 12,
                active: 10,
                used_up: 1,
                expired: 1,
                packs: [
                    {
                        purchase_id: "pp1",
                        pack: "4-class pack",
                        customer_id: "c1",
                        customer: who("Meera Joshi"),
                        classes: 4,
                        used: 1,
                        left: 3,
                        use_by: "2026-11-30",
                        standing: "active",
                    },
                ],
            },
            new Map(),
            MEDIA,
        );
        if (card?.kind !== "table") throw new Error("no table");
        expect(card.data.rows[0]).toEqual([
            "Meera Joshi",
            "4-class pack",
            "3 of 4",
            "30 Nov",
            "Active",
        ]);
        expect(card.data.hrefs).toEqual(["/contacts/c1"]);
        expect(card.data.more).toBe(11);
        expect(card.data.link?.href).toBe("/class-packs/purchases");
    });
});

describe("big lists", () => {
    const order = (i: number) => ({
        order_id: `o${i}`,
        number: `ORD-${i}`,
        status: "completed",
        stage: "collected",
        payment_status: "paid",
        total: "₹1,200",
        customer_id: null,
        created_at: "2026-10-01T05:00:00.000Z",
    });

    it("list_orders: 8 rows, +N more from the exact total, and the Orders screen with the same days", () => {
        const card = answerCard(
            "list_orders",
            {
                orders: Array.from({ length: 20 }, (_, i) => order(i + 1)),
                total: 9_012,
                next_cursor: "x",
            },
            new Map(),
            MEDIA,
            {
                from: "2026-08-14T00:00:00+05:30",
                to: "2026-11-15T00:00:00+05:30",
            },
        );
        expect(askAiInfoCard.parse(card)).toEqual(card);
        if (card?.kind !== "table") throw new Error("no table");
        expect(card.data.rows).toHaveLength(8);
        expect(card.data.more).toBe(9_004);
        // "Placed before" midnight 15 Nov: the screen's last day is 14 Nov.
        expect(card.data.link?.href).toBe(
            "/commerce/orders?date=custom&from=2026-08-14&to=2026-11-14",
        );
    });

    it("ordersHref: no dates is the plain screen; one end is enough", () => {
        expect(ordersHref(undefined)).toBe("/commerce/orders");
        expect(ordersHref({})).toBe("/commerce/orders");
        expect(ordersHref({ from: "2026-11-01T00:00:00+05:30" })).toBe(
            "/commerce/orders?date=custom&from=2026-11-01",
        );
        expect(ordersHref({ from: "not a time" })).toBe("/commerce/orders");
    });

    it("list_customers and list_products count +N more from the total", () => {
        const customers = Array.from({ length: 20 }, (_, i) => ({
            customer_id: `c${i}`,
            name: { untrusted: true as const, text: `Person ${i}` },
            company: null,
            email: null,
            phone: null,
        }));
        const c = answerCard(
            "list_customers",
            { customers, total: 6_000, next_cursor: "x" },
            new Map(),
            MEDIA,
        );
        expect(c?.kind === "table" && c.data.more).toBe(5_992);
        expect(c?.kind === "table" && c.data.link?.href).toBe("/contacts");
    });
});

describe("totalLine", () => {
    it.each([
        [0, 0, false, "No orders."],
        [3, 3, false, "3 orders in all."],
        [9_012, 20, false, "9012 orders in all; showing the first 20."],
        [9_012, 20, true, "9012 orders in all; showing 20 more."],
    ] as const)(
        "%d matches, %d shown (later page %s)",
        (total, shown, later, line) => {
            expect(totalLine(total, shown, "orders", later)).toBe(line);
        },
    );
});

describe("every link a card can carry", () => {
    // The pages check:routes resolves against the app (scripts/check-app-routes.mjs).
    const allowed = Object.values(APP_LINKS).map(({ route, params }) => ({
        path: new RegExp(`^${route.replace(":id", "[^/?]+")}$`),
        params: params as readonly string[],
    }));
    const ok = (href: string | null | undefined) => {
        if (!href) return true;
        const [path, query = ""] = href.split("?");
        const page = allowed.find((a) => a.path.test(path));
        return (
            !!page &&
            [...new URLSearchParams(query).keys()].every((k) =>
                page.params.includes(k),
            )
        );
    };
    const spanOf = (period: string) => ({ ...span, period });

    it.each([
        [
            "get_whats_selling",
            {
                period: "last_3_months",
                from: "2026-08-15",
                to: "2026-11-14",
                best_sellers: [
                    {
                        product_id: "p",
                        name: "P",
                        sold: 1,
                        sold_before: 0,
                        amount: null,
                    },
                ],
                last_sale_on: null,
                booked: [],
            },
        ],
        [
            "list_products",
            {
                products: [
                    {
                        product_id: "p",
                        name: "P",
                        status: "published",
                        price: "₹1",
                        variants: [],
                    },
                ],
                total: 1,
                next_cursor: null,
            },
        ],
        [
            "list_unpaid_bills",
            { bills: [bill(1)], total: 1, next_cursor: null, not_shown: [] },
        ],
        [
            "list_customers",
            {
                customers: [
                    {
                        customer_id: "c",
                        name: who("A"),
                        company: null,
                        email: null,
                        phone: null,
                    },
                ],
                total: 1,
                next_cursor: null,
            },
        ],
        [
            "find_lapsed_customers",
            {
                days: 60,
                customers: [
                    {
                        customer_id: "c",
                        name: who("A"),
                        last_seen_at: "2026-08-01T00:00:00Z",
                        email: null,
                        phone: null,
                    },
                ],
                total: 1,
                next_cursor: null,
            },
        ],
        [
            "summarise_orders",
            {
                span: spanOf("this_month"),
                orders: 1,
                first: [
                    {
                        order_id: "o",
                        number: "ORD-1",
                        customer: null,
                        total: "₹1",
                        status: "paid",
                        placed_on: "2026-11-01",
                    },
                ],
            },
        ],
        [
            "summarise_invoices",
            {
                span: spanOf("today"),
                invoices: 1,
                by_status: [{ status: "paid" }],
                first: [
                    {
                        invoice_id: "i",
                        number: "INV-1",
                        customer: null,
                        amount: "₹1",
                        status: "paid",
                        issued_on: "2026-11-01",
                    },
                ],
            },
        ],
        [
            "summarise_stock",
            {
                span,
                products: 1,
                top: [{ product_id: "p", name: "P", on_hand: 1, value: "₹1" }],
            },
        ],
        [
            "summarise_bookings",
            {
                span,
                bookings: 1,
                cancelled: 0,
                first: [
                    {
                        booking_id: "b",
                        when: "x",
                        service: "S",
                        customer: null,
                        status: "confirmed",
                    },
                ],
            },
        ],
        [
            "get_class_fill",
            {
                span,
                classes: [
                    {
                        name: "C",
                        sessions: 1,
                        booked: 1,
                        places: 1,
                        full_percent: 100,
                    },
                ],
            },
        ],
        [
            "list_waitlist",
            {
                people: 1,
                sessions: [
                    {
                        service_id: "s",
                        service: "S",
                        starts_at: "x",
                        when: "x",
                        waiting: [
                            {
                                position: 1,
                                customer_id: "c",
                                name: null,
                                status: "waiting",
                                offered_until: null,
                            },
                        ],
                    },
                ],
            },
        ],
        [
            "list_class_packs",
            {
                span: null,
                total: 1,
                active: 1,
                used_up: 0,
                expired: 0,
                packs: [
                    {
                        purchase_id: "u",
                        pack: "P",
                        customer_id: "c",
                        customer: null,
                        classes: 5,
                        used: 1,
                        left: 4,
                        use_by: "2026-12-01",
                        standing: "active",
                    },
                ],
            },
        ],
    ] as const)("%s", (tool, data) => {
        const card = answerCard(tool, data, new Map(), MEDIA);
        expect(card).not.toBeNull();
        const links =
            card?.kind === "table"
                ? [card.data.link?.href, ...(card.data.hrefs ?? [])]
                : [
                      card?.data.link?.href,
                      ...(card?.data.items.map((i) => i.href) ?? []),
                  ];
        for (const href of links)
            expect([href, ok(href)]).toEqual([href, true]);
    });

    it("list tools with dates, and the presets for today and this month", () => {
        expect(
            answerCard(
                "list_bookings",
                {
                    bookings: [
                        {
                            booking_id: "b",
                            service_id: "s",
                            service: "S",
                            starts_at: "x",
                            when: "x",
                            status: "confirmed",
                            customer_id: null,
                            customer_name: null,
                            customer_email: null,
                            customer_phone: null,
                            staff_id: null,
                        },
                    ],
                    total: 1,
                    next_cursor: null,
                },
                new Map(),
                MEDIA,
                {
                    from: "2026-11-01T00:00:00+05:30",
                    to: "2026-11-08T00:00:00+05:30",
                },
            )?.data.link?.href,
        ).toBe("/bookings/all?date=custom&from=2026-11-01&to=2026-11-07");
        expect(dateFilter({ period: "today", from: "a", to: "a" })).toEqual({
            date: "today",
        });
        expect(dateFilter({ period: "this_month" })).toEqual({ date: "month" });
        expect(dateFilter({ period: "last_7_days" })).toEqual({ date: "7d" });
        expect(
            appLink("invoices", {
                tab: "due",
                ...dateFilter({
                    period: "last_month",
                    from: "2026-10-01",
                    to: "2026-10-31",
                }),
            }),
        ).toBe(
            "/billing/invoices?tab=due&date=custom&from=2026-10-01&to=2026-10-31",
        );
    });

    it("refuses a query key a page doesn't take, and a record link without an id", () => {
        expect(() => appLink("orders", { tab: "x" } as never)).toThrow(
            /takes no "tab"/,
        );
        expect(appLink("order", {}, null)).toBeNull();
        expect(appLink("order", {}, "a/b")).toBe("/commerce/orders/a%2Fb");
    });
});
